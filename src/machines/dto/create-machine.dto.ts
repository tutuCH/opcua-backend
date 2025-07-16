import { IsString, IsInt, IsOptional, IsNumber } from 'class-validator';

export class CreateMachineDto {
  @IsString()
  machineName: string;

  @IsString()
  machineIpAddress: string;

  @IsString()
  machineIndex: string;

  @IsNumber()
  factoryId: number;

  @IsInt()
  factoryIndex: number;

  @IsString()
  @IsOptional()
  status?: string;
}
