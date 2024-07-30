import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateFactoryDto } from './dto/create-factory.dto';
import { UpdateFactoryDto } from './dto/update-factory.dto';
import { Factory } from './entities/factory.entity';

@Injectable()
export class FactoriesService {
  constructor(
    @InjectRepository(Factory)
    private readonly factoryRepository: Repository<Factory>,
  ) {}

  async create(createFactoryDto: CreateFactoryDto): Promise<Factory> {
    const newFactory = this.factoryRepository.create(createFactoryDto);
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

  async update(id: number, updateFactoryDto: UpdateFactoryDto): Promise<Factory> {
    const factory = await this.factoryRepository.preload({
      factoryId: id,
      ...updateFactoryDto,
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
