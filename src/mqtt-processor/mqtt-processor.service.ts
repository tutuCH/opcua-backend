import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as mqtt from 'mqtt';
import { RedisService } from '../redis/redis.service';
import {
  InfluxDBService,
  RealtimeData,
  SPCData,
} from '../influxdb/influxdb.service';
import { MachineGateway } from '../websocket/machine.gateway';
import { Machine } from '../machines/entities/machine.entity';

export interface TechData {
  devId: string;
  topic: string;
  sendTime: string;
  sendStamp: number;
  time: string;
  timestamp: number;
  Data: Record<string, any>;
}

@Injectable()
export class MqttProcessorService implements OnModuleInit {
  private readonly logger = new Logger(MqttProcessorService.name);
  private mqttClient: mqtt.MqttClient;
  private isProcessing = false;

  constructor(
    private readonly redisService: RedisService,
    private readonly influxDbService: InfluxDBService,
    private readonly machineGateway: MachineGateway,
    @InjectRepository(Machine)
    private readonly machineRepository: Repository<Machine>,
  ) {}

  async onModuleInit() {
    // Clean up old messages from Redis queues to prevent retention policy violations
    await this.redisService.cleanupOldMessages();

    await this.connectToMQTT();
    this.startMessageProcessor();
  }

  private async connectToMQTT() {
    try {
      const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
      const username = process.env.MQTT_USERNAME;
      const password = process.env.MQTT_PASSWORD;

      const options: mqtt.IClientOptions = {
        clientId: `mqtt-processor-${Date.now()}`,
        clean: true,
        reconnectPeriod: 5000, // Increase retry interval to 5 seconds
        connectTimeout: 10000, // Reduce connect timeout to 10 seconds
        keepalive: 60,
        will: {
          topic: 'mqtt-processor/status',
          payload: 'offline',
          qos: 1,
          retain: false,
        },
      };

      if (username && password) {
        options.username = username;
        options.password = password;
      }

      this.mqttClient = mqtt.connect(brokerUrl, options);

      this.mqttClient.on('connect', () => {
        this.logger.log(`✅ Connected to MQTT broker: ${brokerUrl}`);
        this.subscribeToTopics();
      });

      this.mqttClient.on('error', (error) => {
        this.logger.error(`❌ MQTT connection error: ${error.message}`);
        // Don't immediately reconnect on error - let the built-in retry handle it
      });

      this.mqttClient.on('offline', () => {
        this.logger.warn('📴 MQTT client went offline');
      });

      this.mqttClient.on('reconnect', () => {
        this.logger.log('🔄 MQTT client attempting reconnection...');
      });

      this.mqttClient.on('close', () => {
        this.logger.warn('🔌 MQTT connection closed');
      });

      this.mqttClient.on('disconnect', () => {
        this.logger.warn('💔 MQTT client disconnected');
      });

      this.mqttClient.on('message', async (topic, payload) => {
        await this.handleMqttMessage(topic, payload);
      });
    } catch (error) {
      this.logger.error('Failed to connect to MQTT broker:', error);
      throw error;
    }
  }

  private subscribeToTopics() {
    const topics = [
      '+/realtime', // Subscribe to all devices' realtime data
      '+/spc', // Subscribe to all devices' SPC data
      '+/tech', // Subscribe to all devices' tech data
    ];

    topics.forEach((topic) => {
      this.mqttClient.subscribe(topic, (error) => {
        if (error) {
          this.logger.error(`Failed to subscribe to topic ${topic}:`, error);
        } else {
          this.logger.log(`Subscribed to topic: ${topic}`);
        }
      });
    });
  }

  private async handleMqttMessage(topic: string, payload: Buffer) {
    try {
      this.logger.debug(`📨 Received MQTT message on topic: ${topic}`);

      const message = JSON.parse(payload.toString());
      this.logger.debug(`📋 Parsed message:`, {
        devId: message.devId,
        topic: message.topic,
        timestamp: message.timestamp,
        dataKeys: Object.keys(message.Data || {}),
      });

      // Validate message structure
      if (!this.validateMessage(message)) {
        this.logger.warn(
          `❌ Invalid message structure from topic ${topic}:`,
          message,
        );
        return;
      }

      // Check if machine exists in database
      const deviceId = message.devId;
      this.logger.debug(`🔍 Looking for machine: "${deviceId}" in database`);

      const machine = await this.machineRepository.findOne({
        where: { machineName: deviceId },
      });

      if (!machine) {
        this.logger.warn(
          `❌ Unknown machine "${deviceId}", ignoring message. Available machines should be checked.`,
        );
        // Log available machines for debugging
        const allMachines = await this.machineRepository.find({
          select: ['machineName', 'machineId'],
        });
        this.logger.debug(
          `Available machines in database:`,
          allMachines.map((m) => `"${m.machineName}"`),
        );
        return;
      }

      this.logger.debug(
        `✅ Machine "${deviceId}" found in database (ID: ${machine.machineId})`,
      );

      // Enqueue message for processing
      await this.redisService.enqueueMQTTMessage(topic, message);

      this.logger.debug(`✅ Message from ${deviceId} enqueued for processing`);
    } catch (error) {
      this.logger.error(
        `💥 Failed to handle MQTT message from topic ${topic}:`,
        error,
      );
    }
  }

  private validateMessage(message: any): boolean {
    return (
      message &&
      typeof message.devId === 'string' &&
      typeof message.topic === 'string' &&
      typeof message.timestamp === 'number' &&
      message.Data &&
      typeof message.Data === 'object'
    );
  }

  private startMessageProcessor() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    this.processMessages();
  }

  private async processMessages() {
    while (this.isProcessing) {
      try {
        // Process different message types
        await Promise.all([
          this.processRealtimeMessages(),
          this.processSPCMessages(),
          this.processTechMessages(),
        ]);

        // Small delay to prevent tight loop
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        this.logger.error('Error in message processing loop:', error);
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Longer delay on error
      }
    }
  }

  private async processRealtimeMessages() {
    // Use a short timeout to avoid blocking the processing loop
    const message = await this.redisService.dequeueMessage('mqtt:realtime', 1);
    if (!message) return;

    try {
      this.logger.debug(`🔄 Processing realtime message from queue`);
      const data: RealtimeData = message.payload;

      // Check if message timestamp is too old (older than 1 hour)
      const messageTime = new Date(data.timestamp);
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      if (messageTime < oneHourAgo) {
        this.logger.warn(
          `⏰ Dropping old realtime message for device ${data.devId}: timestamp ${messageTime.toISOString()} is older than 1 hour`,
        );
        return;
      }

      this.logger.debug(
        `📊 Processing realtime data for device ${data.devId}:`,
        {
          oilTemp: data.Data.OT,
          status: data.Data.STS,
          operateMode: data.Data.OPM,
          tempCount: Object.keys(data.Data).filter((k) => k.startsWith('T'))
            .length,
        },
      );

      // Store in InfluxDB
      this.logger.debug(`💾 Writing to InfluxDB for device ${data.devId}`);
      await this.influxDbService.writeRealtimeData(data);

      // Update cache
      this.logger.debug(`🗄️ Updating Redis cache for device ${data.devId}`);
      await this.redisService.setMachineStatus(data.devId, {
        ...data,
        lastUpdated: new Date().toISOString(),
      });

      // WebSocket broadcasting will be handled by Redis pub/sub in MachineGateway
      this.logger.log(
        `📡 Realtime update for device ${data.devId} will be broadcasted via Redis pub/sub`,
      );

      // Publish to Redis for other services
      await this.redisService.publish('mqtt:realtime:processed', {
        deviceId: data.devId,
        data,
      });

      // Check for alerts
      await this.checkForAlerts(data);

      this.logger.log(
        `✅ Successfully processed realtime message for device ${data.devId}`,
      );
    } catch (error) {
      this.logger.error(`💥 Failed to process realtime message:`, error);
      // Re-queue the message for retry (implement retry logic if needed)
    }
  }

  private async processSPCMessages() {
    // Use a short timeout to avoid blocking the processing loop
    const message = await this.redisService.dequeueMessage('mqtt:spc', 1);
    if (!message) return;

    try {
      this.logger.debug(`🔄 Processing SPC message from queue`);
      const data: SPCData = message.payload;

      // Check if message timestamp is too old (older than 1 hour)
      const messageTime = new Date(data.timestamp);
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      if (messageTime < oneHourAgo) {
        this.logger.warn(
          `⏰ Dropping old SPC message for device ${data.devId}: timestamp ${messageTime.toISOString()} is older than 1 hour`,
        );
        return;
      }

      this.logger.debug(`📊 Processing SPC data for device ${data.devId}:`, {
        cycleNumber: data.Data.CYCN,
        cycleTime: data.Data.ECYCT,
        injectionVelocity: data.Data.EIVM,
        injectionPressure: data.Data.EIPM,
      });

      // Store in InfluxDB
      this.logger.debug(
        `💾 Writing SPC data to InfluxDB for device ${data.devId}`,
      );
      await this.influxDbService.writeSPCData(data);

      // WebSocket broadcasting will be handled by Redis pub/sub in MachineGateway
      this.logger.log(
        `📡 SPC update for device ${data.devId} will be broadcasted via Redis pub/sub`,
      );

      // Publish to Redis for other services
      await this.redisService.publish('mqtt:spc:processed', {
        deviceId: data.devId,
        data,
      });

      this.logger.log(
        `✅ Successfully processed SPC message for device ${data.devId}, cycle ${data.Data.CYCN}`,
      );
    } catch (error) {
      this.logger.error(`💥 Failed to process SPC message:`, error);
    }
  }

  private async processTechMessages() {
    // Use a short timeout to avoid blocking the processing loop
    const message = await this.redisService.dequeueMessage('mqtt:tech', 1);
    if (!message) return;

    try {
      const data: TechData = message.payload;

      // Store tech data in PostgreSQL (could be a separate tech_configurations table)
      // For now, we'll just cache it and broadcast
      await this.redisService.set(
        `machine:${data.devId}:tech_config`,
        data.Data,
        3600, // Cache for 1 hour
      );

      // Tech config will be available via Redis cache and can be requested via WebSocket

      this.logger.debug(
        `Processed tech configuration for device ${data.devId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to process tech message:`, error);
    }
  }

  private async checkForAlerts(data: RealtimeData) {
    try {
      const alerts = [];

      // Check oil temperature alert
      if (data.Data.OT > 80) {
        // Threshold: 80°C
        alerts.push({
          type: 'high_oil_temperature',
          severity: 'warning',
          message: `Oil temperature is high: ${data.Data.OT}°C`,
          threshold: 80,
          value: data.Data.OT,
        });
      }

      // Check if any barrel temperature is too high
      const tempFields = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
      tempFields.forEach((field, index) => {
        const temp = data.Data[field];
        if (temp && temp > 250) {
          // Threshold: 250°C
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
        // Assuming 0 means error state
        alerts.push({
          type: 'machine_error',
          severity: 'critical',
          message: 'Machine is in error state',
          value: data.Data.STS,
        });
      }

      // Publish alerts to Redis for processing via MachineGateway
      for (const alert of alerts) {
        await this.redisService.publish('machine:alerts', {
          deviceId: data.devId,
          alert,
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to check alerts for device ${data.devId}:`,
        error,
      );
    }
  }

  // Manual flush method for graceful shutdown
  async flush() {
    try {
      await this.influxDbService.flush();
      this.logger.log('Message processor flushed');
    } catch (error) {
      this.logger.error('Failed to flush message processor:', error);
    }
  }

  // Health check
  isConnected(): boolean {
    return this.mqttClient?.connected || false;
  }

  // Get processing statistics
  async getProcessingStats() {
    try {
      const realtimeQueueLength =
        await this.redisService.getQueueLength('mqtt:realtime');
      const spcQueueLength = await this.redisService.getQueueLength('mqtt:spc');
      const techQueueLength =
        await this.redisService.getQueueLength('mqtt:tech');

      return {
        connected: this.isConnected(),
        processing: this.isProcessing,
        queueLengths: {
          realtime: realtimeQueueLength,
          spc: spcQueueLength,
          tech: techQueueLength,
        },
      };
    } catch (error) {
      this.logger.error('Failed to get processing stats:', error);
      return null;
    }
  }

  async onModuleDestroy() {
    this.isProcessing = false;

    if (this.mqttClient) {
      this.mqttClient.end();
    }

    await this.flush();
    this.logger.log('MQTT processor shutdown complete');
  }
}
