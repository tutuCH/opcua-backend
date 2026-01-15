import { IsNotEmpty, IsString } from 'class-validator';
import { IsStrongPassword } from './password-validator.dto';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsString()
  @IsStrongPassword()
  @IsNotEmpty()
  newPassword: string;
}
