import { IsString, IsInt, IsOptional } from 'class-validator';

export class CreateMachineDto {
  @IsString()
  machineName: string;

  @IsString()
  machineIpAddress: string;

  @IsString()
  machineIndex: string;
  
  @IsInt()
  userId: number;

  @IsInt()
  factoryId: number;

  @IsInt()
  factoryIndex: number;

  @IsString()
  @IsOptional()
  status?: string;
}