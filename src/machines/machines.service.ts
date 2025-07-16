import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { CreateMachineDto } from './dto/create-machine.dto';
import { UpdateMachineDto } from './dto/update-machine.dto';
import { UpdateMachineIndexDto } from './dto/update-machine-index.dto';
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

  async create(
    createMachineDto: CreateMachineDto,
    userId: number,
  ): Promise<Machine> {
    const { factoryId, ...machineDetails } = createMachineDto;
    try {
      // Find the authenticated user
      const user = await this.userRepository.findOne({
        where: { userId: userId },
      });
      if (!user) {
        throw new NotFoundException(`User not found`);
      }

      const factory = await this.factoryRepository.findOne({
        where: { factoryId: factoryId },
        relations: ['user'],
      });
      if (!factory) {
        throw new NotFoundException(`Factory with ID ${factoryId} not found`);
      }

      // Verify factory ownership
      if (factory.user.userId !== userId) {
        throw new UnauthorizedException(
          'You do not have access to this factory',
        );
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
            throw new NotFoundException(
              `Factory with ID ${factoryId} not found`,
            );
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

  async findOneForUser(id: number, userId: number): Promise<Machine> {
    const machine = await this.machineRepository.findOne({
      where: { machineId: id },
      relations: ['user', 'factory'],
    });

    if (!machine) {
      throw new NotFoundException(`Machine with ID ${id} not found`);
    }

    if (machine.user.userId !== userId) {
      throw new UnauthorizedException('You do not have access to this machine');
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

  async updateForUser(
    id: number,
    updateMachineDto: UpdateMachineDto,
    userId: number,
  ): Promise<Machine> {
    // First verify ownership
    await this.findOneForUser(id, userId);

    const machine = await this.machineRepository.preload({
      machineId: id,
      ...updateMachineDto,
    });

    return await this.machineRepository.save(machine);
  }

  async updateIndex(
    id: number,
    index: number,
  ): Promise<{
    message: string;
    status: string;
    machineId: number;
    machineIndex: number;
  }> {
    try {
      const machine = await this.findOne(id);
      if (!machine) {
        throw new NotFoundException(`Machine with ID ${id} not found`);
      }
      machine.machineIndex = index.toString();
      await this.machineRepository.save(machine);
      return {
        message: `Machine with ID ${id} successfully updated. New machineIndex: ${machine.machineIndex}`,
        status: 'success',
        machineId: machine.machineId,
        machineIndex: parseInt(machine.machineIndex),
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('An unexpected error occurred');
    }
  }

  async updateIndexForUser(
    id: number,
    index: number,
    userId: number,
  ): Promise<any> {
    // First verify ownership
    await this.findOneForUser(id, userId);

    try {
      const machine = await this.findOne(id);
      machine.machineIndex = index.toString();
      await this.machineRepository.save(machine);
      return {
        message: `Machine with ID ${id} successfully updated. New machineIndex: ${machine.machineIndex}`,
        status: 'success',
        machineId: machine.machineId,
        machineIndex: parseInt(machine.machineIndex),
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('An unexpected error occurred');
    }
  }

  async updateMachineIndex(
    updateMachineIndexDto: UpdateMachineIndexDto,
    userId: number,
  ): Promise<any> {
    const { machineId, machineIndex, factoryId } = updateMachineIndexDto;

    try {
      // Verify user exists
      const user = await this.userRepository.findOne({
        where: { userId: userId },
      });
      if (!user) {
        throw new NotFoundException(`User not found`);
      }

      // Verify factory exists and belongs to user
      const factory = await this.factoryRepository.findOne({
        where: { factoryId: factoryId },
        relations: ['user'],
      });
      if (!factory) {
        throw new NotFoundException(`Factory with ID ${factoryId} not found`);
      }
      if (factory.user.userId !== userId) {
        throw new UnauthorizedException(
          'You do not have access to this factory',
        );
      }

      // Verify machine exists and belongs to user and factory
      const machine = await this.machineRepository.findOne({
        where: { machineId: machineId },
        relations: ['user', 'factory'],
      });
      if (!machine) {
        throw new NotFoundException(`Machine with ID ${machineId} not found`);
      }
      if (machine.user.userId !== userId) {
        throw new UnauthorizedException(
          'You do not have access to this machine',
        );
      }
      if (machine.factory.factoryId !== factoryId) {
        throw new UnauthorizedException(
          'Machine does not belong to the specified factory',
        );
      }

      // Update machine index
      machine.machineIndex = machineIndex.toString();
      await this.machineRepository.save(machine);

      return {
        message: `Machine with ID ${machineId} successfully updated. New machineIndex: ${machine.machineIndex}`,
        status: 'success',
        machineId: machine.machineId,
        machineIndex: parseInt(machine.machineIndex),
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('An unexpected error occurred');
    }
  }

  async remove(id: number): Promise<string> {
    const machine = await this.findOne(id);
    if (!machine) {
      return `Machine with ID ${id} not found.`;
    }
    await this.machineRepository.remove(machine);
    return `Machine with ID ${id} successfully removed.`;
  }

  async removeForUser(id: number, userId: number): Promise<string> {
    // First verify ownership
    const machine = await this.findOneForUser(id, userId);

    await this.machineRepository.remove(machine);
    return `Machine with ID ${id} successfully removed.`;
  }

  async findFactoriesAndMachinesByUserId(userId: number): Promise<any[]> {
    const factoriesWithMachines = await this.factoryRepository
      .createQueryBuilder('factory')
      .leftJoinAndSelect('factory.user', 'user')
      .leftJoinAndSelect('factory.machines', 'machine')
      .select([
        'factory.factoryId',
        'factory.factoryName',
        'factory.width',
        'factory.height',
        'machine.machineId',
        'machine.machineName',
        'machine.machineIpAddress',
        'machine.machineIndex',
      ])
      .where('user.userId = :userId', { userId })
      .orderBy('factory.createdAt', 'ASC')
      .getMany();

    // If no factories with machines are found, return an empty array
    if (!factoriesWithMachines.length) {
      return [];
    }

    // Transform the data to ensure each factory has an empty machines array if no machines are present
    const result = factoriesWithMachines.map((factory) => ({
      factoryId: factory.factoryId,
      factoryName: factory.factoryName,
      factoryWidth: factory.width,
      factoryHeight: factory.height,
      machines: factory.machines.length
        ? factory.machines
            .map((machine) => ({
              machineId: machine.machineId,
              machineName: machine.machineName,
              machineIpAddress: machine.machineIpAddress,
              machineIndex: parseInt(machine.machineIndex || '0'),
            }))
            .sort((a, b) => a.machineIndex - b.machineIndex)
        : [],
    }));

    this.logger.log(
      `findFactoriesAndMachinesByUserId: ${JSON.stringify(result)}`,
    );
    return result;
  }
}
