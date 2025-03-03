import { IsString, IsInt } from 'class-validator';

export class CreateFactoryDto {
  @IsString()
  factoryName: string;

  @IsInt()
  factoryIndex: number;  

  @IsInt()
  width: number;
  
  @IsInt()
  height: number;  
}
