import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class CreateConnectionDto {
  @IsNotEmpty()
  @IsString()
  brokerUrl: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  password?: string;
}
