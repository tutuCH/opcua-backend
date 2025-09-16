import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DebugController } from './debug.controller';
import { RedisModule } from '../redis/redis.module';
import { InfluxDBModule } from '../influxdb/influxdb.module';
import { MqttProcessorModule } from '../mqtt-processor/mqtt-processor.module';
import { Machine } from '../machines/entities/machine.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Machine]),
    RedisModule,
    InfluxDBModule,
    MqttProcessorModule
  ],
  controllers: [DebugController],
})
export class DebugModule {}
