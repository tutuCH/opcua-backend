import { Module } from '@nestjs/common';
import { FactoriesService } from './factories.service';
import { FactoriesController } from './factories.controller';
import { Factory } from './entities/factory.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([Factory])],
  controllers: [FactoriesController],
  providers: [FactoriesService],
})
export class FactoriesModule {}
