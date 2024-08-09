import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { CreateMachineDto } from './dto/create-machine.dto';
import { UpdateMachineDto } from './dto/update-machine.dto';
import { Machine } from './entities/machine.entity';
import { User } from '../user/entities/user.entity';
import { Factory } from '../factories/entities/factory.entity';
@Injectable()
export class MachinesService {
  private readonly logger = new Logger(MachinesService.name);
  constructor(
    @InjectRepository(Machine)
    private readonly machineRepository: Repository<Machine>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Factory)
    private readonly factoryRepository: Repository<Factory>,
  ) {}

  async create(createMachineDto: CreateMachineDto): Promise<Machine> {
    const { userId, factoryId, ...machineDetails } = createMachineDto;
    try {
      // Find the related user and factory
      const user = await this.userRepository.findOne({
        where: { userId: userId },
      });
      if (!user) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }

      const factory = await this.factoryRepository.findOne({
        where: { factoryId: factoryId },
      });
      if (!factory) {
        throw new NotFoundException(`Factory with ID ${factoryId} not found`);
      }

      // Create a new machine entity
      const newMachine = this.machineRepository.create({
        ...machineDetails,
        user,
        factory,
      });

      // Save the new machine to the database
      return await this.machineRepository.save(newMachine);
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const errorMessage = error.message;
        if (errorMessage.includes('ER_NO_REFERENCED_ROW')) {
          if (errorMessage.includes('FOREIGN KEY (`userId`)')) {
            throw new NotFoundException(`User with ID ${userId} not found`);
          } else if (errorMessage.includes('FOREIGN KEY (`factoryId`)')) {
            throw new NotFoundException(`Factory with ID ${factoryId} not found`);
          }
        } else if (errorMessage.includes('Duplicate entry')) {
          throw new ConflictException('Machine IP Address already exists');
        }
      }
      
      throw new InternalServerErrorException('An unexpected error occurred');
    }
  }

  async findAll(): Promise<Machine[]> {
    return await this.machineRepository.find({
      relations: ['user', 'factory'],
    });
  }

  async findOne(id: number): Promise<Machine> {
    const machine = await this.machineRepository.findOne({
      where: { machineId: id },
      relations: ['user', 'factory'],
    });
    if (!machine) {
      throw new NotFoundException(`Machine with ID ${id} not found`);
    }
    return machine;
  }

  async update(
    id: number,
    updateMachineDto: UpdateMachineDto,
  ): Promise<Machine> {
    const machine = await this.machineRepository.preload({
      machineId: id,
      ...updateMachineDto,
    });
    if (!machine) {
      throw new NotFoundException(`Machine with ID ${id} not found`);
    }
    return await this.machineRepository.save(machine);
  }

  async remove(id: number): Promise<string> {
    const machine = await this.findOne(id);
    if (!machine) {
      return `Machine with ID ${id} not found.`;
    }
    await this.machineRepository.remove(machine);
    return `Machine with ID ${id} successfully removed.`;
  }
  

  // async findFactoriesAndMachinesByUserId(userId: number): Promise<any[]> {
  //   const factoriesWithMachines = await this.machineRepository
  //     .createQueryBuilder('machine')
  //     .leftJoinAndSelect('machine.factory', 'factory')
  //     .leftJoinAndSelect('factory.user', 'user')
  //     .select([
  //       'factory.factoryId',
  //       'factory.factoryName',
  //       'machine.machineId',
  //       'machine.machineName',
  //       'machine.machineIpAddress',
  //       'machine.machineIndex',
  //     ])
  //     .where('user.userId = :userId', { userId })
  //     .orderBy('factory.createdAt', 'ASC')
  //     .getMany();

  //   if (!factoriesWithMachines.length) {
  //     throw new NotFoundException(
  //       `Factories and machines for userId ${userId} not found`,
  //     );
  //   }

  //   // Group machines by factory
  //   const factoryMap = new Map<number, any>();

  //   factoriesWithMachines.forEach((machine) => {
  //     const factoryId = machine.factory.factoryId;

  //     if (!factoryMap.has(factoryId)) {
  //       factoryMap.set(factoryId, {
  //         factoryId: machine.factory.factoryId,
  //         factoryName: machine.factory.factoryName,
  //         machines: [],
  //       });
  //     }

  //     factoryMap.get(factoryId).machines.push({
  //       machineId: machine.machineId,
  //       machineName: machine.machineName,
  //       machineIpAddress: machine.machineIpAddress,
  //       machineIndex: machine.machineIndex,
  //     });
  //   });

  //   const result = Array.from(factoryMap.values());
  //   this.logger.log(
  //     `findFactoriesAndMachinesByUserId: ${JSON.stringify(result)}`,
  //   );
  //   return result;
  // }


  async findFactoriesAndMachinesByUserId(userId: number): Promise<any[]> {
    const factoriesWithMachines = await this.factoryRepository
      .createQueryBuilder('factory')
      .leftJoinAndSelect('factory.user', 'user')
      .leftJoinAndSelect('factory.machines', 'machine')
      .select([
        'factory.factoryId',
        'factory.factoryName',
        'machine.machineId',
        'machine.machineName',
        'machine.machineIpAddress',
        'machine.machineIndex',
      ])
      .where('user.userId = :userId', { userId })
      .orderBy('factory.createdAt', 'ASC')
      .getMany();
  
    if (!factoriesWithMachines.length) {
      throw new NotFoundException(`Factories and machines for userId ${userId} not found`);
    }
  
    // Transform the data to ensure each factory has an empty machines array if no machines are present
    const result = factoriesWithMachines.map(factory => ({
      factoryId: factory.factoryId,
      factoryName: factory.factoryName,
      machines: factory.machines.length ? factory.machines.map(machine => ({
        machineId: machine.machineId,
        machineName: machine.machineName,
        machineIpAddress: machine.machineIpAddress,
        machineIndex: machine.machineIndex,
      })) : []
    }));
  
    this.logger.log(`findFactoriesAndMachinesByUserId: ${JSON.stringify(result)}`);
    return result;
  }
  
}
