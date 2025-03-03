import { Module } from '@nestjs/common';
import { MqttConnectionController } from './mqtt-connection.controller';
import { MqttConnectionService } from './mqtt-connection.service';

@Module({
  controllers: [MqttConnectionController],
  providers: [MqttConnectionService],
})
export class MqttConnectionModule {}
