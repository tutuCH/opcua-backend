import { Injectable, NotFoundException } from '@nestjs/common';
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

  async create(createFactoryDto: CreateFactoryDto): Promise<Factory> {
    const { userId, ...factoryDetails } = createFactoryDto;
    const user = await this.userRepository.findOne({
      where: { userId: userId },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }    
    const newFactory = this.factoryRepository.create({
      ...factoryDetails,
      user,
      factoryIndex: createFactoryDto.factoryIndex.toString(),
    });
    return await this.factoryRepository.save(newFactory);
  }

  async findAll(): Promise<Factory[]> {
    return await this.factoryRepository.find({ relations: ['machines'] });
  }

  async findOne(id: number): Promise<Factory> {
    const factory = await this.factoryRepository.findOne({ where: { factoryId: id }, relations: ['machines'] });
    if (!factory) {
      throw new NotFoundException(`Factory with ID ${id} not found`);
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
    
    if (!factories.length) {
      throw new NotFoundException(`Factories for userId ${userId} not found`);
    }

    console.log(JSON.stringify(factories));
    return factories;
  }

  async update(id: number, updateFactoryDto: UpdateFactoryDto): Promise<Factory> {
    const factory = await this.factoryRepository.preload({
      factoryId: id,
      ...updateFactoryDto,
      factoryIndex: updateFactoryDto.factoryIndex.toString(), // Convert factoryIndex to string
    });
    if (!factory) {
      throw new NotFoundException(`Factory with ID ${id} not found`);
    }
    return await this.factoryRepository.save(factory);
  }

  async remove(id: number): Promise<void> {
    const factory = await this.findOne(id);
    await this.factoryRepository.remove(factory);
  }
}
