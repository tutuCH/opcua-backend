import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { RedisService } from '../redis/redis.service';
import { InfluxDBService } from '../influxdb/influxdb.service';
import { MqttProcessorService } from '../mqtt-processor/mqtt-processor.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Machine } from '../machines/entities/machine.entity';

@Controller('debug')
@Public()
export class DebugController {
  constructor(
    private readonly redisService: RedisService,
    private readonly influxDbService: InfluxDBService,
    private readonly mqttProcessor: MqttProcessorService,
    @InjectRepository(Machine)
    private readonly machineRepository: Repository<Machine>,
  ) {}

  @Get('redis/queue-lengths')
  async getQueueLengths() {
    try {
      const result = await Promise.race([
        Promise.all([
          this.redisService.getQueueLength('mqtt:realtime'),
          this.redisService.getQueueLength('mqtt:spc'),
          this.redisService.getQueueLength('mqtt:tech'),
        ]),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 5000)
        )
      ]);

      const [realtime, spc, tech] = result;

      return {
        success: true,
        'mqtt:realtime': realtime,
        'mqtt:spc': spc,
        'mqtt:tech': tech,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('redis/peek-message/:queue')
  async peekMessage(@Param('queue') queue: string) {
    // Get a message without removing it (peek)
    const message = await this.redisService.dequeueMessage(queue, 1);
    if (message) {
      // Put it back at the front
      await this.redisService.enqueueMessage(queue, message);
      return { message, queue };
    }
    return { message: null, queue };
  }

  @Get('process/single-realtime')
  async processSingleRealtime() {
    try {
      // Use direct Redis dequeue with timeout 0 for immediate response
      const message = await this.redisService.dequeueMessage(
        'mqtt:realtime',
        0,
      );
      if (!message) {
        return {
          error: 'No messages in queue',
          queueLength: await this.redisService.getQueueLength('mqtt:realtime'),
        };
      }

      // Write to InfluxDB
      await this.influxDbService.writeRealtimeData(message.payload);

      // Flush to ensure write
      await this.influxDbService.flush();

      return {
        success: true,
        processedMessage: message,
        remainingInQueue:
          await this.redisService.getQueueLength('mqtt:realtime'),
      };
    } catch (error) {
      return { error: error.message, stack: error.stack };
    }
  }

  @Get('process/single-spc')
  async processSingleSPC() {
    try {
      const message = await this.redisService.dequeueMQTTMessage('mqtt:spc');
      if (!message) {
        return {
          error: 'No messages in queue',
          queueLength: await this.redisService.getQueueLength('mqtt:spc'),
        };
      }

      await this.influxDbService.writeSPCData(message.payload);
      await this.influxDbService.flush();

      return {
        success: true,
        processedMessage: message,
        remainingInQueue: await this.redisService.getQueueLength('mqtt:spc'),
      };
    } catch (error) {
      return { error: error.message, stack: error.stack };
    }
  }

  @Get('influxdb/test-connection')
  async testInfluxConnection() {
    try {
      // Test with a simple write
      const testData = {
        devId: 'test-device',
        topic: 'test',
        sendTime: new Date().toISOString(),
        sendStamp: Date.now(),
        time: new Date().toISOString(),
        timestamp: Date.now(),
        Data: {
          OT: 50.0,
          ATST: 0,
          OPM: 1,
          STS: 1,
          T1: 220.0,
          T2: 221.0,
          T3: 222.0,
          T4: 223.0,
          T5: 224.0,
          T6: 225.0,
          T7: 226.0,
        },
      };

      await this.influxDbService.writeRealtimeData(testData);
      await this.influxDbService.flush();

      return { success: true, testData };
    } catch (error) {
      return { error: error.message, stack: error.stack };
    }
  }

  @Get('processor/status')
  async getProcessorStatus() {
    try {
      const stats = await this.mqttProcessor.getProcessingStats();
      const isConnected = this.mqttProcessor.isConnected();

      return {
        isConnected,
        processingStats: stats,
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  @Get('process/flush-all')
  async processAllMessages() {
    try {
      let processed = 0;
      const maxProcess = 10; // Limit to prevent timeout

      // Process realtime messages
      for (let i = 0; i < maxProcess; i++) {
        const message =
          await this.redisService.dequeueMQTTMessage('mqtt:realtime');
        if (!message) break;

        await this.influxDbService.writeRealtimeData(message.payload);
        processed++;
      }

      // Process SPC messages
      for (let i = 0; i < maxProcess; i++) {
        const message = await this.redisService.dequeueMQTTMessage('mqtt:spc');
        if (!message) break;

        await this.influxDbService.writeSPCData(message.payload);
        processed++;
      }

      await this.influxDbService.flush();

      const remainingQueues = await this.getQueueLengths();

      return {
        success: true,
        processedCount: processed,
        remainingQueues,
      };
    } catch (error) {
      return { error: error.message, stack: error.stack };
    }
  }

  @Get('simple-machine-check')
  async getSimpleMachineCheck() {
    try {
      const machines = await this.machineRepository.find({
        select: ['machineId', 'machineName', 'machineIpAddress', 'status'],
      });

      return {
        success: true,
        timestamp: new Date().toISOString(),
        machineCount: machines.length,
        machines: machines.map(m => ({
          id: m.machineId,
          name: `"${m.machineName}"`, // Quoted to see exact spacing
          ip: m.machineIpAddress,
          status: m.status,
        })),
        targetMachineExists: machines.some(m => m.machineName === 'postgres machine 1'),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('comprehensive-diagnostic')
  async getComprehensiveDiagnostic() {
    const results: {
      timestamp: string;
      services: {
        mqttProcessor?: {
          connected: boolean;
          stats: any;
        } | { error: string };
      };
      machines: {
        count?: number;
        machines?: Array<{
          id: number;
          name: string;
          ip: string;
          status: string;
        }>;
        targetMachineCache?: {
          exists: boolean;
          lastUpdate: string | null;
        };
      };
      queues: {
        'mqtt:realtime'?: number;
        'mqtt:spc'?: number;
        'mqtt:tech'?: number;
      };
      errors: string[];
    } = {
      timestamp: new Date().toISOString(),
      services: {},
      machines: {},
      queues: {},
      errors: [],
    };

    try {
      // Check machines in database
      try {
        const machines = await this.machineRepository.find({
          select: ['machineId', 'machineName', 'machineIpAddress', 'status'],
        });
        results.machines = {
          count: machines.length,
          machines: machines.map(m => ({
            id: m.machineId,
            name: m.machineName,
            ip: m.machineIpAddress,
            status: m.status,
          })),
        };
      } catch (error: any) {
        results.errors.push(`Database error: ${error.message}`);
      }

      // Check MQTT processor status
      try {
        results.services.mqttProcessor = {
          connected: this.mqttProcessor.isConnected(),
          stats: await Promise.race([
            this.mqttProcessor.getProcessingStats(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Timeout')), 3000)
            )
          ]),
        };
      } catch (error: any) {
        results.errors.push(`MQTT processor error: ${error.message}`);
        results.services.mqttProcessor = { error: error.message };
      }

      // Check Redis queues
      try {
        const queueResult = await Promise.race([
          Promise.all([
            this.redisService.getQueueLength('mqtt:realtime'),
            this.redisService.getQueueLength('mqtt:spc'),
            this.redisService.getQueueLength('mqtt:tech'),
          ]),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 3000)
          )
        ]);

        const [realtime, spc, tech] = queueResult;

        results.queues = {
          'mqtt:realtime': realtime,
          'mqtt:spc': spc,
          'mqtt:tech': tech,
        };
      } catch (error: any) {
        results.errors.push(`Redis queue error: ${error.message}`);
      }

      // Check for specific machine status
      if (results.machines.machines?.length > 0) {
        const targetMachine = results.machines.machines.find(m => m.name === 'postgres machine 1');
        if (targetMachine) {
          try {
            const machineStatus = await this.redisService.getMachineStatus('postgres machine 1');
            results.machines.targetMachineCache = {
              exists: !!machineStatus,
              lastUpdate: machineStatus?.lastUpdated || null,
            };
          } catch (error: any) {
            results.errors.push(`Machine cache error: ${error.message}`);
          }
        } else {
          results.errors.push(`Target machine "postgres machine 1" not found in database`);
        }
      }

      return results;
    } catch (error: any) {
      results.errors.push(`General diagnostic error: ${error.message}`);
      return results;
    }
  }
}
