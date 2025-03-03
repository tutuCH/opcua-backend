import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateFactoryDto } from './dto/create-factory.dto';
import { UpdateFactoryDto } from './dto/update-factory.dto';
import { Factory } from './entities/factory.entity';
import { User } from 'src/user/entities/user.entity';

@Injectable()
export class FactoriesService {
  constructor(
    @InjectRepository(Factory)
    private readonly factoryRepository: Repository<Factory>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createFactoryDto: CreateFactoryDto, userId: number): Promise<Factory> {
    const user = await this.userRepository.findOne({
      where: { userId: userId },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }    
    const newFactory = this.factoryRepository.create({
      ...createFactoryDto,
      user,
      factoryIndex: createFactoryDto.factoryIndex.toString(),
      width: createFactoryDto.width.toString(),
      height: createFactoryDto.height.toString(),
    });
    return await this.factoryRepository.save(newFactory);
  }

  async findAllForUser(userId: number): Promise<Factory[]> {
    return await this.factoryRepository.find({ 
      where: { user: { userId } },
      relations: ['machines'] 
    });
  }

  async findAll(): Promise<Factory[]> {
    return await this.factoryRepository.find({ relations: ['machines'] });
  }

  async findOne(id: number): Promise<Factory> {
    const factory = await this.factoryRepository.findOne({ 
      where: { factoryId: id }, 
      relations: ['machines', 'user'] 
    });
    if (!factory) {
      throw new NotFoundException(`Factory with ID ${id} not found`);
    }
    return factory;
  }

  async findOneForUser(id: number, userId: number): Promise<Factory> {
    const factory = await this.factoryRepository.findOne({ 
      where: { factoryId: id },
      relations: ['machines', 'user'] 
    });
    
    if (!factory) {
      throw new NotFoundException(`Factory with ID ${id} not found`);
    }
    
    if (factory.user.userId !== userId) {
      throw new UnauthorizedException('You do not have access to this factory');
    }
    
    return factory;
  }

  async findFactoriesByUserId(userId: number): Promise<Factory[]> {
    const factories = await this.factoryRepository.createQueryBuilder('factory')
      .select(['factory.factoryId', 'factory.factoryName', 'factory.createdAt'])
      .innerJoin('factory.user', 'user')
      .where('user.userId = :userId', { userId })
      .orderBy('factory.createdAt', 'DESC')
      .getMany();
    
    return factories;
  }

  async updateForUser(id: number, updateFactoryDto: UpdateFactoryDto, userId: number): Promise<Factory> {
    await this.findOneForUser(id, userId);

    const factory = await this.factoryRepository.preload({
      factoryId: id,
      ...updateFactoryDto,
      factoryIndex: updateFactoryDto.factoryIndex.toString(),
      width: updateFactoryDto.width.toString(),
      height: updateFactoryDto.height.toString(),      
    });
    
    return await this.factoryRepository.save(factory);
  }

  async update(id: number, updateFactoryDto: UpdateFactoryDto): Promise<Factory> {
    const factory = await this.factoryRepository.preload({
      factoryId: id,
      ...updateFactoryDto,
      factoryIndex: updateFactoryDto.factoryIndex.toString(),
      width: updateFactoryDto.width.toString(),
      height: updateFactoryDto.height.toString(),      
    });
    if (!factory) {
      throw new NotFoundException(`Factory with ID ${id} not found`);
    }
    return await this.factoryRepository.save(factory);
  }

  async removeForUser(id: number, userId: number): Promise<void> {
    // First check if the factory exists and belongs to this user
    const factory = await this.findOneForUser(id, userId);
    
    // Remove the factory
    await this.factoryRepository.remove(factory);
  }

  async remove(id: number): Promise<void> {
    const factory = await this.findOne(id);
    await this.factoryRepository.remove(factory);
  }
}
