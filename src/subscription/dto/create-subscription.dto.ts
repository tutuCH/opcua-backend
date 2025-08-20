import { IsString, IsOptional } from 'class-validator';

export class CreateSubscriptionDto {
  @IsString()
  lookupKey: string;

  @IsOptional()
  @IsString()
  paymentMethodId?: string;
}
