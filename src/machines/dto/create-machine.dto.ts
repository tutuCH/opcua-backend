import { IsString, IsInt, IsOptional } from 'class-validator';

export class CreateMachineDto {
  @IsString()
  machineName: string;

  @IsInt()
  userId: number;

  @IsInt()
  factoryId: number;

  @IsString()
  @IsOptional()
  status?: string;
}
