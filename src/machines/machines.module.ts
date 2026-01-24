import { Module } from '@nestjs/common';
import { MachinesService } from './machines.service';
import { MachinesController } from './machines.controller';
import { Machine } from './entities/machine.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/user/entities/user.entity';
import { Factory } from 'src/factories/entities/factory.entity';
import { InfluxDBModule } from '../influxdb/influxdb.module';
import { RedisModule } from '../redis/redis.module';
import { SPCLimitsModule } from '../spc-limits/spc-limits.module';
import { LatestDataCacheModule } from '../latest-data-cache/latest-data-cache.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Machine, User, Factory]),
    InfluxDBModule,
    RedisModule,
    SPCLimitsModule,
    LatestDataCacheModule,
  ],
  controllers: [MachinesController],
  providers: [MachinesService],
  exports: [MachinesService],
})
export class MachinesModule {}
