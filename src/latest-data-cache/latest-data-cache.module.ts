import { Module } from '@nestjs/common';
import { LatestDataCacheService } from './latest-data-cache.service';
import { InfluxDBModule } from '../influxdb/influxdb.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [InfluxDBModule, RedisModule],
  providers: [LatestDataCacheService],
  exports: [LatestDataCacheService],
})
export class LatestDataCacheModule {}
