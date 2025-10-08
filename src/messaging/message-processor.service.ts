import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReliableQueueService, MessageJob } from './reliable-queue.service';
import {
  InfluxDBService,
  RealtimeData,
  SPCData,
} from '../influxdb/influxdb.service';
import { MachineGateway } from '../websocket/machine.gateway';
import { RedisService } from '../redis/redis.service';
import { Machine } from '../machines/entities/machine.entity';

@Injectable()
export class MessageProcessorService implements OnModuleInit {
  private readonly logger = new Logger(MessageProcessorService.name);
  private stopWorkers: (() => void)[] = [];

  constructor(
    private readonly reliableQueue: ReliableQueueService,
    private readonly influxDbService: InfluxDBService,
    private readonly machineGateway: MachineGateway,
    private readonly redisService: RedisService,
    @InjectRepository(Machine)
    private readonly machineRepository: Repository<Machine>,
  ) {}

  async onModuleInit() {
    // Start workers for different message types with different concurrency
    await this.startWorkers();

    // Start cleanup job for stuck messages
    setInterval(() => this.cleanupStuckJobs(), 60000); // Every minute
  }

  private async startWorkers() {
    // High-frequency realtime data - more workers
    const realtimeStop = await this.reliableQueue.startWorker(
      'mqtt_realtime',
      (job) => this.processRealtimeMessage(job),
      { concurrency: 3, workerId: 'realtime-worker' },
    );

    // Medium-frequency SPC data - moderate workers
    const spcStop = await this.reliableQueue.startWorker(
      'mqtt_spc',
      (job) => this.processSPCMessage(job),
      { concurrency: 2, workerId: 'spc-worker' },
    );

    // Low-frequency tech data - single worker
    const techStop = await this.reliableQueue.startWorker(
      'mqtt_tech',
      (job) => this.processTechMessage(job),
      { concurrency: 1, workerId: 'tech-worker' },
    );

    // High-priority alerts - dedicated worker
    const alertStop = await this.reliableQueue.startWorker(
      'alerts',
      (job) => this.processAlertMessage(job),
      { concurrency: 1, workerId: 'alert-worker' },
    );

    this.stopWorkers = [realtimeStop, spcStop, techStop, alertStop];
    this.logger.log('All message processing workers started');
  }

  // Producer methods - called by MQTT service
  async enqueueRealtimeMessage(topic: string, payload: any): Promise<string> {
    return this.reliableQueue.addJob(
      'mqtt_realtime',
      { topic, payload },
      {
        maxAttempts: 3,
        priority: 5, // Medium priority
      },
    );
  }

  async enqueueSPCMessage(topic: string, payload: any): Promise<string> {
    return this.reliableQueue.addJob(
      'mqtt_spc',
      { topic, payload },
      {
        maxAttempts: 5,
        priority: 3, // Lower priority, but more important for business logic
      },
    );
  }

  async enqueueTechMessage(topic: string, payload: any): Promise<string> {
    return this.reliableQueue.addJob(
      'mqtt_tech',
      { topic, payload },
      {
        maxAttempts: 2,
        priority: 1, // Lowest priority
      },
    );
  }

  async enqueueAlert(deviceId: string, alert: any): Promise<string> {
    return this.reliableQueue.addJob(
      'alerts',
      { deviceId, alert },
      {
        maxAttempts: 5,
        priority: 10, // Highest priority
      },
    );
  }

  // Consumer methods - process different message types
  private async processRealtimeMessage(job: MessageJob): Promise<void> {
    const { payload } = job.data;
    const data: RealtimeData = payload;

    try {
      // Validate message
      if (!this.validateRealtimeData(data)) {
        throw new Error(`Invalid realtime data structure`);
      }

      // Check if machine exists
      const machine = await this.machineRepository.findOne({
        where: { machineName: data.devId },
      });

      if (!machine) {
        throw new Error(`Unknown machine ${data.devId}`);
      }

      // Store in InfluxDB
      await this.influxDbService.writeRealtimeData(data);

      // Update Redis cache
      await this.redisService.setMachineStatus(data.devId, {
        ...data,
        lastUpdated: new Date().toISOString(),
      });

      // WebSocket broadcasting will be handled by Redis pub/sub in MachineGateway

      // Publish processed event
      await this.redisService.publish('mqtt:realtime:processed', {
        deviceId: data.devId,
        data,
        processedAt: new Date().toISOString(),
      });

      // Check for alerts (enqueue high-priority alert processing)
      await this.checkForAlerts(data);

      this.logger.debug(`Processed realtime message for device ${data.devId}`);
    } catch (error) {
      this.logger.error(
        `Failed to process realtime message for ${payload.devId}:`,
        error,
      );
      throw error; // Let reliable queue handle retry logic
    }
  }

  private async processSPCMessage(job: MessageJob): Promise<void> {
    const { payload } = job.data;
    const data: SPCData = payload;

    try {
      if (!this.validateSPCData(data)) {
        throw new Error(`Invalid SPC data structure`);
      }

      // Store in InfluxDB
      await this.influxDbService.writeSPCData(data);

      // WebSocket broadcasting will be handled by Redis pub/sub in MachineGateway

      // Publish processed event
      await this.redisService.publish('mqtt:spc:processed', {
        deviceId: data.devId,
        data,
        processedAt: new Date().toISOString(),
      });

      this.logger.debug(
        `Processed SPC message for device ${data.devId}, cycle ${data.Data.CYCN}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process SPC message for ${payload.devId}:`,
        error,
      );
      throw error;
    }
  }

  private async processTechMessage(job: MessageJob): Promise<void> {
    const { payload } = job.data;

    try {
      if (!payload.devId) {
        throw new Error(`Missing device ID in tech message`);
      }

      // Cache tech configuration
      await this.redisService.set(
        `machine:${payload.devId}:tech_config`,
        payload.Data,
        3600, // Cache for 1 hour
      );

      // Tech config will be available via Redis cache and can be requested via WebSocket

      this.logger.debug(
        `Processed tech configuration for device ${payload.devId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process tech message for ${payload.devId}:`,
        error,
      );
      throw error;
    }
  }

  private async processAlertMessage(job: MessageJob): Promise<void> {
    const { deviceId, alert } = job.data;

    try {
      // Alert broadcasting will be handled by Redis pub/sub in MachineGateway

      // Store in Redis for alert history
      await this.redisService.lpush(
        `machine:${deviceId}:alerts`,
        JSON.stringify({ ...alert, timestamp: new Date().toISOString() }),
      );

      // Keep only last 100 alerts
      await this.redisService.ltrim(`machine:${deviceId}:alerts`, 0, 99);

      // Send to external alert systems (email, Slack, etc.) if critical
      if (alert.severity === 'critical') {
        await this.sendCriticalAlert(deviceId, alert);
      }

      this.logger.log(`Processed alert for device ${deviceId}: ${alert.type}`);
    } catch (error) {
      this.logger.error(`Failed to process alert for ${deviceId}:`, error);
      throw error;
    }
  }

  private async checkForAlerts(data: RealtimeData): Promise<void> {
    const alerts = [];

    // Check oil temperature alert
    if (data.Data.OT > 80) {
      alerts.push({
        type: 'high_oil_temperature',
        severity: 'warning',
        message: `Oil temperature is high: ${data.Data.OT}°C`,
        threshold: 80,
        value: data.Data.OT,
      });
    }

    // Check barrel temperatures
    const tempFields = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    tempFields.forEach((field, index) => {
      const temp = data.Data[field];
      if (temp && temp > 250) {
        alerts.push({
          type: 'high_barrel_temperature',
          severity: 'critical',
          message: `Barrel temperature zone ${index + 1} is critical: ${temp}°C`,
          threshold: 250,
          value: temp,
          zone: index + 1,
        });
      }
    });

    // Check machine status for errors
    if (data.Data.STS === 0) {
      alerts.push({
        type: 'machine_error',
        severity: 'critical',
        message: 'Machine is in error state',
        value: data.Data.STS,
      });
    }

    // Enqueue alerts for processing
    for (const alert of alerts) {
      await this.enqueueAlert(data.devId, alert);
    }
  }

  private async sendCriticalAlert(deviceId: string, alert: any): Promise<void> {
    // Implement integration with external alerting systems
    // Email, Slack, PagerDuty, etc.
    this.logger.warn(`CRITICAL ALERT for ${deviceId}: ${alert.message}`);
  }

  private validateRealtimeData(data: any): boolean {
    return (
      data &&
      typeof data.devId === 'string' &&
      data.Data &&
      typeof data.Data === 'object'
    );
  }

  private validateSPCData(data: any): boolean {
    return (
      data && typeof data.devId === 'string' && data.Data && data.Data.CYCN
    );
  }

  private async cleanupStuckJobs(): Promise<void> {
    const queues = ['mqtt_realtime', 'mqtt_spc', 'mqtt_tech', 'alerts'];

    for (const queue of queues) {
      try {
        await this.reliableQueue.cleanupStuckJobs(queue);
      } catch (error) {
        this.logger.error(
          `Failed to cleanup stuck jobs in queue ${queue}:`,
          error,
        );
      }
    }
  }

  // Health check and monitoring
  async getProcessingStats() {
    const queues = ['mqtt_realtime', 'mqtt_spc', 'mqtt_tech', 'alerts'];
    const stats = {};

    for (const queue of queues) {
      stats[queue] = await this.reliableQueue.getQueueStats(queue);
    }

    return {
      queues: stats,
      workers: this.stopWorkers.length > 0 ? 'running' : 'stopped',
    };
  }

  async onModuleDestroy() {
    // Stop all workers gracefully
    this.stopWorkers.forEach((stop) => stop());
    this.logger.log('Message processor shutdown complete');
  }
}
