import { Module } from '@nestjs/common';
import { AppController } from './controller/app.controller';
import { AppService } from './service/app.service';
import { OpcuaService } from './service/opcua.service';
import { OpcuaController } from './controller/opcua.controller';
@Module({
  imports: [],
  controllers: [AppController, OpcuaController],
  providers: [AppService, OpcuaService],
})
export class AppModule {}
