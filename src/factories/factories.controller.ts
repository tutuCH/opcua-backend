import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { FactoriesService } from './factories.service';
import { CreateFactoryDto } from './dto/create-factory.dto';
import { UpdateFactoryDto } from './dto/update-factory.dto';
import { JwtUserId } from '../auth/decorators/jwt-user-id.decorator';

@Controller('factories')
export class FactoriesController {
  constructor(private readonly factoriesService: FactoriesService) {}

  @Post()
  create(
    @Body() createFactoryDto: CreateFactoryDto,
    @JwtUserId() userId: number,
  ) {
    return this.factoriesService.create(createFactoryDto, userId);
  }

  @Get()
  findAll(@JwtUserId() userId: number) {
    return this.factoriesService.findAllForUser(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @JwtUserId() userId: number) {
    return this.factoriesService.findOneForUser(+id, userId);
  }

  @Get('user/factories')
  findFactoriesByUserId(@JwtUserId() userId: number) {
    return this.factoriesService.findFactoriesByUserId(userId);
  }

  @Patch(':factoryId')
  update(
    @Param('factoryId') id: string,
    @Body() updateFactoryDto: UpdateFactoryDto,
    @JwtUserId() userId: number,
  ) {
    return this.factoriesService.updateForUser(+id, updateFactoryDto, userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @JwtUserId() userId: number) {
    return this.factoriesService.removeForUser(+id, userId);
  }
}
