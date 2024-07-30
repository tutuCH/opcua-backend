import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as amqp from 'amqplib';

@Injectable()
export class RabbitmqService implements OnModuleDestroy {
  private connection: amqp.Connection;
  private channel: amqp.Channel;

  async connect() {
    this.connection = await amqp.connect('amqp://localhost');
    this.channel = await this.connection.createChannel();
    await this.channel.assertQueue('opcua_data', { durable: true });
  }

  async publishOpcUaData(message: String) {
    this.channel.sendToQueue('opcua_data', Buffer.from(message), { persistent: true });
  }

  async onModuleDestroy() {
    await this.channel.close();
    await this.connection.close();
  }
}
