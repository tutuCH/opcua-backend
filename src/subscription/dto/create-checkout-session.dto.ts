import { IsString, IsUrl } from 'class-validator';

export class CreateCheckoutSessionDto {
  @IsString()
  lookupKey: string;

  @IsUrl()
  successUrl: string;

  @IsUrl()
  cancelUrl: string;
}
