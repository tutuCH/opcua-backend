import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class AddPaymentMethodDto {
  @IsString()
  paymentMethodId: string;

  @IsOptional()
  @IsBoolean()
  setAsDefault?: boolean;
}
