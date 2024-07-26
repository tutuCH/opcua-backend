// src/opcua/opcua.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { OpcuaService } from '../service/opcua.service';


@Controller('opcua')
export class OpcuaController {
  constructor(private readonly opcuaService: OpcuaService) {}

  @Post('connect')
  async activate(@Body() requestBody: { endpoint: string }) {
    const { endpoint } = requestBody;
    await this.opcuaService.setConnection(endpoint);
    return { message: 'Activation initiated' };
  }

  @Post('disconnect')
  async disconnect(@Body() requestBody: { endpoint: string }) {
    const { endpoint } = requestBody;
    await this.opcuaService.disconnect(endpoint);
    return { message: 'Disconnected from OPC UA server' };
  }  
}
