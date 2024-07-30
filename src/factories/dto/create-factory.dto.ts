import { IsString, IsOptional } from 'class-validator';

export class CreateFactoryDto {
  @IsString()
  factoryName: string;
}
