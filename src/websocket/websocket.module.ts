import { Module } from '@nestjs/common';
import { MachineGateway } from './machine.gateway';
import { RedisModule } from '../redis/redis.module';
import { InfluxDBModule } from '../influxdb/influxdb.module';

@Module({
  imports: [RedisModule, InfluxDBModule],
  providers: [MachineGateway],
  exports: [MachineGateway],
})
export class WebSocketModule {}
