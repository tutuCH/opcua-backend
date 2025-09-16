import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';
import { RedisModule } from '../redis/redis.module';
import { InfluxDBModule } from '../influxdb/influxdb.module';
import { MqttProcessorModule } from '../mqtt-processor/mqtt-processor.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { MockDataModule } from '../mock-data/mock-data.module';
import { HealthModule } from '../health/health.module';
import { Machine } from '../machines/entities/machine.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Machine]),
    RedisModule,
    InfluxDBModule,
    MqttProcessorModule,
    WebSocketModule,
    MockDataModule,
    HealthModule,
  ],
  controllers: [DemoController],
  providers: [DemoService],
  exports: [DemoService],
})
export class DemoModule {}
