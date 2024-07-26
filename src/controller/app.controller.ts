import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppService } from '../service/app.service';
import { OpcuaService } from '../service/opcua.service';

@Controller('app')
export class AppController {
  constructor(private readonly appService: AppService) {}

  // @Get()
  // getHello(): string {
  //   return this.appService.getHello();
  // }

  // @Post('connect')
  // async activate(@Body() requestBody: { endpoint: string }) {
  //   const { endpoint } = requestBody;
  //   await this.appService.setConnection(endpoint);
  //   return { message: 'Activation initiated' };
  // }

  // @Post('disconnect')
  // async disconnect(@Body() requestBody: { endpoint: string }) {
  //   const { endpoint } = requestBody;
  //   await this.appService.disconnect(endpoint);
  //   return { message: 'Disconnected from OPC UA server' };
  // }  
}
