import { Module } from '@nestjs/common';
import { MachineTimestreamController } from './machine-timestream.service.controller';
import { MachineTimestreamService } from './machine-timestream.service';

@Module({
  controllers: [MachineTimestreamController],
  providers: [MachineTimestreamService],
})
export class MachineTimestreamModule {}
