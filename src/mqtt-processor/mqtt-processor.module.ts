import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MqttProcessorService } from './mqtt-processor.service';
import { RedisModule } from '../redis/redis.module';
import { InfluxDBModule } from '../influxdb/influxdb.module';
import { Machine } from '../machines/entities/machine.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Machine]), RedisModule, InfluxDBModule],
  providers: [MqttProcessorService],
  exports: [MqttProcessorService],
})
export class MqttProcessorModule {}
