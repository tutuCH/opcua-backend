import { IsNumber, IsPositive } from 'class-validator';

export class UpdateMachineIndexDto {
  @IsNumber()
  @IsPositive()
  machineId: number;

  @IsNumber()
  @IsPositive()
  machineIndex: number;

  @IsNumber()
  @IsPositive()
  factoryId: number;
}
