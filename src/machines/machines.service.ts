import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateMachineDto } from './dto/create-machine.dto';
import { UpdateMachineDto } from './dto/update-machine.dto';
import { Machine } from './entities/machine.entity';

@Injectable()
export class MachinesService {
  constructor(
    @InjectRepository(Machine)
    private readonly machineRepository: Repository<Machine>,
  ) {}

  async create(createMachineDto: CreateMachineDto): Promise<Machine> {
    const newMachine = this.machineRepository.create(createMachineDto);
    return await this.machineRepository.save(newMachine);
  }

  async findAll(): Promise<Machine[]> {
    return await this.machineRepository.find({ relations: ['user', 'factory'] });
  }

  async findOne(id: number): Promise<Machine> {
    const machine = await this.machineRepository.findOne({ where: { machineId: id }, relations: ['user', 'factory'] });
    if (!machine) {
      throw new NotFoundException(`Machine with ID ${id} not found`);
    }
    return machine;
  }

  async update(id: number, updateMachineDto: UpdateMachineDto): Promise<Machine> {
    const machine = await this.machineRepository.preload({
      machineId: id,
      ...updateMachineDto,
    });
    if (!machine) {
      throw new NotFoundException(`Machine with ID ${id} not found`);
    }
    return await this.machineRepository.save(machine);
  }

  async remove(id: number): Promise<void> {
    const machine = await this.findOne(id);
    await this.machineRepository.remove(machine);
  }
}
