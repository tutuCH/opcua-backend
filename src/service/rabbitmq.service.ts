import { Injectable } from '@nestjs/common';
import * as amqp from 'amqplib';

@Injectable()
export class RabbitMQService {
  private connection: amqp.Connection;
  private channel: amqp.Channel;
  private readonly queue = 'opcua-messages';

  constructor() {
    this.initialize();
  }

  async initialize() {
    try {
      this.connection = await amqp.connect('amqp://localhost');
      this.channel = await this.connection.createChannel();
      await this.channel.assertQueue(this.queue, { durable: true });
    } catch (error) {
      console.error('Error initializing RabbitMQ:', error);
    }
  }

  async sendMessage(message: any) {
    await this.ensureInitialized();
    this.channel.sendToQueue(this.queue, Buffer.from(JSON.stringify(message)), {
      persistent: true,
    });
  }

  async receiveMessages(onMessage: (msg: any) => void) {
    await this.ensureInitialized();
    this.channel.consume(
      this.queue,
      (msg) => {
        if (msg !== null) {
          const message = JSON.parse(msg.content.toString());
          onMessage(message);
          this.channel.ack(msg);
        }
      },
      { noAck: false },
    );
  }

  private async ensureInitialized() {
    if (!this.channel) {
      await this.initialize();
    }
  }
}
