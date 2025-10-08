import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MockDataService } from './mock-data.service';
import { Machine } from '../machines/entities/machine.entity';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [TypeOrmModule.forFeature([Machine]), RedisModule],
  providers: [MockDataService],
  exports: [MockDataService],
})
export class MockDataModule {}
