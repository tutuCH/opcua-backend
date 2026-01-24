import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CreateMachineDto {
  @IsString()
  machineName: string;

  @IsString()
  machineIndex: string;

  @IsNumber()
  factoryId: number;

  @IsString()
  @IsOptional()
  status?: string;
}
