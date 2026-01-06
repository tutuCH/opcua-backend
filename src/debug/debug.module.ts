import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DebugController } from './debug.controller';
import { RedisModule } from '../redis/redis.module';
import { InfluxDBModule } from '../influxdb/influxdb.module';
import { MqttProcessorModule } from '../mqtt-processor/mqtt-processor.module';
import { Machine } from '../machines/entities/machine.entity';
import { User } from '../user/entities/user.entity';
import { UserSubscription } from '../subscription/entities/user-subscription.entity';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Machine, User, UserSubscription]),
    RedisModule,
    InfluxDBModule,
    MqttProcessorModule,
    SubscriptionModule,
  ],
  controllers: [DebugController],
})
export class DebugModule {}
