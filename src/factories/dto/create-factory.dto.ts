import { IsString, IsOptional, IsInt } from 'class-validator';

export class CreateFactoryDto {
  @IsString()
  factoryName: string;

  @IsInt()
  userId: number;  

  @IsInt()
  factoryIndex: number;  

  @IsInt()
  width: number;
  
  @IsInt()
  height: number;  
}
