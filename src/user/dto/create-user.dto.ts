import { IsString, IsEmail, IsNotEmpty, IsEnum } from 'class-validator';
import { UserStatus } from '../entities/user.entity';

export class CreateUserDto {
  @IsString()
  // @IsNotEmpty()
  username: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsString()
  // @IsNotEmpty()
  accessLevel: string;

  @IsEnum(['active', 'pending_verification', 'inactive'])
  // @IsNotEmpty()
  status: UserStatus;
}
