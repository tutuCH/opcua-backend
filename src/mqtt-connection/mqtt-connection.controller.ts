import { Controller, Post, Body, Delete, Param } from '@nestjs/common';
import { MqttConnectionService } from './mqtt-connection.service';
import { CreateConnectionDto } from './dto/create-connection.dto';

@Controller('connections')
export class MqttConnectionController {
  constructor(private readonly mqttService: MqttConnectionService) {}

  @Post()
  async create(@Body() createConnectionDto: CreateConnectionDto) {
    return await this.mqttService.createConnection(createConnectionDto);
  }

  @Delete(':clientId')
  async remove(@Param('clientId') clientId: string) {
    return await this.mqttService.removeConnection(clientId);
  }
}
