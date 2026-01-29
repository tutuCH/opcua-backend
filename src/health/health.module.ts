import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { RedisModule } from '../redis/redis.module';
import { InfluxDBModule } from '../influxdb/influxdb.module';
import { MqttProcessorModule } from '../mqtt-processor/mqtt-processor.module';
import { RealtimeStreamModule } from '../realtime-stream/realtime-stream.module';
import { MockDataModule } from '../mock-data/mock-data.module';

@Module({
  imports: [
    RedisModule,
    InfluxDBModule,
    MqttProcessorModule,
    RealtimeStreamModule,
    MockDataModule,
  ],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
