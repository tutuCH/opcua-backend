import { IsOptional, IsInt, Min, Max, IsEnum } from 'class-validator';

export class CreateStreamTicketDto {
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(3600)
  ttlSeconds?: number;

  @IsOptional()
  @IsEnum(['alerts', 'data'], {
    message: 'purpose must be either "alerts" or "data"'
  })
  purpose?: 'alerts' | 'data';
}
