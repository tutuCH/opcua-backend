import { Module } from '@nestjs/common';
import { OpcuaService } from './opcua.service';
import { OpcuaController } from './opcua.controller';
import { RabbitmqService } from '../helper/rabbitmq.service';
@Module({
  controllers: [OpcuaController],
  providers: [OpcuaService, RabbitmqService],
})
export class OpcuaModule {}
