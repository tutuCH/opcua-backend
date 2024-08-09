import { Module } from '@nestjs/common';
import { FactoriesService } from './factories.service';
import { FactoriesController } from './factories.controller';
import { Factory } from './entities/factory.entity';
import { User } from 'src/user/entities/user.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([Factory, User])],
  controllers: [FactoriesController],
  providers: [FactoriesService],
})
export class FactoriesModule {}
