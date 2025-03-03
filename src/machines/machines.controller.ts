import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { MachinesService } from './machines.service';
import { CreateMachineDto } from './dto/create-machine.dto';
import { UpdateMachineDto } from './dto/update-machine.dto';
import { JwtUserId } from '../auth/decorators/jwt-user-id.decorator';

@Controller('machines')
export class MachinesController {
  constructor(private readonly machinesService: MachinesService) {}

  @Post()
  create(@Body() createMachineDto: CreateMachineDto, @JwtUserId() userId: number) {
    return this.machinesService.create(createMachineDto, userId);
  }

  @Get('factories-machines')
  findFactoriesAndMachinesByUserId(@JwtUserId() userId: number) {
    return this.machinesService.findFactoriesAndMachinesByUserId(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @JwtUserId() userId: number) {
    return this.machinesService.findOneForUser(+id, userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string, 
    @Body() updateMachineDto: UpdateMachineDto, 
    @JwtUserId() userId: number
  ) {
    return this.machinesService.updateForUser(+id, updateMachineDto, userId);
  }

  @Patch('update-index/:machineId/:machineIndex')
  updateIndex(
    @Param('machineId') id: string, 
    @Param('machineIndex') index: string, 
    @JwtUserId() userId: number
  ) {
    return this.machinesService.updateIndexForUser(+id, +index, userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @JwtUserId() userId: number) {
    return this.machinesService.removeForUser(+id, userId);
  }
}
