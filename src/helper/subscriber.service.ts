// src/rabbitmq/rabbitmq-subscriber.service.ts
import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import * as amqp from 'amqplib';

@Injectable()
export class SubscriberService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SubscriberService.name);
  private connection: amqp.Connection;
  private channel: amqp.Channel;

  async onModuleInit() {
    await this.connect();
    await this.consumeMessages();
  }

  async connect() {
    try {
      this.connection = await amqp.connect('amqp://localhost');
      this.channel = await this.connection.createChannel();
      await this.channel.assertQueue('opcua_data', { durable: true });
      this.logger.log('Connected to RabbitMQ');
    } catch (error) {
      this.logger.error('Failed to connect to RabbitMQ', error);
      throw new Error('RabbitMQ connection error');
    }
  }

  async consumeMessages() {
    try {
      await this.channel.consume('opcua_data', (msg) => {
        if (msg !== null) {
          const messageContent = msg.content.toString();
          this.logger.log(`Received message: ${messageContent}`);
          // Process the message here
          this.processMessage(messageContent);
          this.channel.ack(msg);
        }
      });
      this.logger.log('Started consuming messages from opcua_data queue');
    } catch (error) {
      this.logger.error('Failed to consume messages from RabbitMQ', error);
    }
  }

  async processMessage(message: string) {
    // Implement your message processing logic here
    this.logger.log(`Processing message: ${message}`);
  }

  async onModuleDestroy() {
    try {
      await this.channel.close();
      await this.connection.close();
      this.logger.log('RabbitMQ connection closed');
    } catch (error) {
      this.logger.error('Error closing RabbitMQ connection', error);
    }
  }
}
