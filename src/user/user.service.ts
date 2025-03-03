import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const newUser = this.userRepository.create(createUserDto);
    return await this.userRepository.save(newUser);
  }

  async findAll(): Promise<User[]> {
    return await this.userRepository.find();
  }

  async findOne(email: string): Promise<User> {
    try {
      const user = await this.userRepository.findOne({
        where: { email: email },
      });
      return user;
    } catch (error) {
      throw new Error(`Error connecting to the database: ${error.message}`);
    }
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.userRepository.preload({
      userId: id,
      ...updateUserDto,
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return await this.userRepository.save(user);
  }

  async remove(email: string): Promise<void> {
    const user = await this.findOne(email);
    await this.userRepository.remove(user);
  }

  async updatePassword(userId: number, newPassword: string): Promise<void> {
    await this.userRepository.update(userId, { password: newPassword });
  }
}
