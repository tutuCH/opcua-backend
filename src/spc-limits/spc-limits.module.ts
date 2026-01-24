import { Module } from '@nestjs/common';
import { SPCLimitsService } from './spc-limits.service';
import { InfluxDBModule } from '../influxdb/influxdb.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [InfluxDBModule, RedisModule],
  providers: [SPCLimitsService],
  exports: [SPCLimitsService],
})
export class SPCLimitsModule {}
