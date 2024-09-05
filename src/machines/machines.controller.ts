import { Controller, Get, Post, Body, Patch, Param, Delete, UnauthorizedException, Request } from '@nestjs/common';
import { MachinesService } from './machines.service';
import { CreateMachineDto } from './dto/create-machine.dto';
import { UpdateMachineDto } from './dto/update-machine.dto';

@Controller('machines')
export class MachinesController {
  constructor(private readonly machinesService: MachinesService) {}

  @Post()
  create(@Body() createMachineDto: CreateMachineDto) {
    return this.machinesService.create(createMachineDto);
  }

  @Get('factories-machines/:userId')
  findFactoriesAndMachinesByUserId(@Param('userId') userId: number, @Request() req) {
    return this.machinesService.findFactoriesAndMachinesByUserId(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.machinesService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateMachineDto: UpdateMachineDto) {
    return this.machinesService.update(+id, updateMachineDto);
  }

  // @Patch('update-index/:machineId/:machineIndex')
  // updateIndex(@Param('machineId') id: string, @Param('machineIndex') index: string) {
  //   return this.machinesService.updateIndex(+id, +index);
  // }
  @Patch('update-index/:machineId/:machineIndex')
  updateIndex(@Param('machineId') id: string, @Param('machineIndex') index: string) {
    return this.machinesService.updateIndex(+id, +index);
  }
  

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.machinesService.remove(+id);
  }
}
