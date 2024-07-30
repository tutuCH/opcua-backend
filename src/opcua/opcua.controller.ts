import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { OpcuaService } from './opcua.service';
import { ConnectOpcuaDto } from './dto/connect-opcua.dto';
import { DisconnectOpcuaDto } from './dto/disconnect-opcua.dto';

@Controller('opcua')
export class OpcuaController {
  constructor(private readonly opcuaService: OpcuaService) {}

  @Post('connect')
  async activate(@Body() requestBody: ConnectOpcuaDto /*{ endpoint: string }*/) {
    const { endpoint } = requestBody;
    await this.opcuaService.setConnection(endpoint);
    return { message: 'Activation initiated' };
  }

  @Post('disconnect')
  async disconnect(@Body() requestBody: DisconnectOpcuaDto /*{ endpoint: string }*/) {
    const { endpoint } = requestBody;
    await this.opcuaService.disconnect(endpoint);
    return { message: 'Disconnected from OPC UA server' };
  }  
}
