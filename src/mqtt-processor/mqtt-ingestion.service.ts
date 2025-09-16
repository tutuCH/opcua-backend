import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as mqtt from 'mqtt';
import { MessageProcessorService } from '../messaging/message-processor.service';
import { Machine } from '../machines/entities/machine.entity';

@Injectable()
export class MqttIngestionService implements OnModuleInit {
  private readonly logger = new Logger(MqttIngestionService.name);
  private mqttClient: mqtt.MqttClient;

  constructor(
    private readonly messageProcessor: MessageProcessorService,
    @InjectRepository(Machine)
    private readonly machineRepository: Repository<Machine>,
  ) {}

  async onModuleInit() {
    await this.connectToMQTT();
  }

  private async connectToMQTT() {
    try {
      const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
      const username = process.env.MQTT_USERNAME;
      const password = process.env.MQTT_PASSWORD;

      const options: mqtt.IClientOptions = {
        clientId: `mqtt-ingestion-${Date.now()}`,
        clean: true,
        reconnectPeriod: 1000,
        connectTimeout: 30000,
      };

      if (username && password) {
        options.username = username;
        options.password = password;
      }

      this.mqttClient = mqtt.connect(brokerUrl, options);

      this.mqttClient.on('connect', () => {
        this.logger.log(`Connected to MQTT broker: ${brokerUrl}`);
        this.subscribeToTopics();
      });

      this.mqttClient.on('error', (error) => {
        this.logger.error('MQTT connection error:', error);
      });

      this.mqttClient.on('offline', () => {
        this.logger.warn('MQTT client went offline');
      });

      this.mqttClient.on('reconnect', () => {
        this.logger.log('MQTT client reconnecting...');
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
    const topics = ['+/realtime', '+/spc', '+/tech'];

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
      const message = JSON.parse(payload.toString());

      // Basic validation
      if (!this.validateMessage(message)) {
        this.logger.warn(
          `Invalid message structure from topic ${topic}:`,
          message,
        );
        return;
      }

      // Check if machine exists in database
      const deviceId = message.devId;
      const machine = await this.machineRepository.findOne({
        where: { machineName: deviceId },
      });

      if (!machine) {
        this.logger.warn(`Unknown machine ${deviceId}, ignoring message`);
        return;
      }

      // Route message to appropriate queue based on topic type
      const topicParts = topic.split('/');
      const topicType = topicParts[topicParts.length - 1];

      let jobId: string;

      switch (topicType) {
        case 'realtime':
          jobId = await this.messageProcessor.enqueueRealtimeMessage(
            topic,
            message,
          );
          break;
        case 'spc':
          jobId = await this.messageProcessor.enqueueSPCMessage(topic, message);
          break;
        case 'tech':
          jobId = await this.messageProcessor.enqueueTechMessage(
            topic,
            message,
          );
          break;
        default:
          this.logger.warn(`Unknown topic type: ${topicType}`);
          return;
      }

      this.logger.debug(
        `MQTT message from ${deviceId} enqueued as job ${jobId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle MQTT message from topic ${topic}:`,
        error,
      );
      // In a production system, you might want to send this to a dead letter queue
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

  // Health check
  isConnected(): boolean {
    return this.mqttClient?.connected || false;
  }

  async onModuleDestroy() {
    if (this.mqttClient) {
      this.mqttClient.end();
    }
    this.logger.log('MQTT ingestion service shutdown complete');
  }
}
