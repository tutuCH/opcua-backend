import { Module } from '@nestjs/common';
import { MachinesService } from './machines.service';
import { MachinesController } from './machines.controller';
import { Machine } from './entities/machine.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/user/entities/user.entity';
import { Factory } from 'src/factories/entities/factory.entity';
import { InfluxDBModule } from '../influxdb/influxdb.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Machine, User, Factory]),
    InfluxDBModule,
    RedisModule,
  ],
  controllers: [MachinesController],
  providers: [MachinesService],
})
export class MachinesModule {}
