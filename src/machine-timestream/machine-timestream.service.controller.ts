import { Controller, Post, Body, Delete, Param } from '@nestjs/common';
import { MachineTimestreamService } from './machine-timestream.service';

@Controller('machine-timestream')
export class MachineTimestreamController {
  constructor(private readonly machineTimestreamService: MachineTimestreamService) {}

  @Post()
  async loadDemoDataToAwsTimestream() {
    return await this.machineTimestreamService.loadDemoDataToAwsTimestream();
  }
}
