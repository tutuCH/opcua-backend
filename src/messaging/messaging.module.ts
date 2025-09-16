import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReliableQueueService } from './reliable-queue.service';
import { MessageProcessorService } from './message-processor.service';
import { RedisModule } from '../redis/redis.module';
import { InfluxDBModule } from '../influxdb/influxdb.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { Machine } from '../machines/entities/machine.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Machine]),
    RedisModule,
    InfluxDBModule,
    WebSocketModule,
  ],
  providers: [ReliableQueueService, MessageProcessorService],
  exports: [ReliableQueueService, MessageProcessorService],
})
export class MessagingModule {}
