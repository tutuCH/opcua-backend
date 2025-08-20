import { IsUrl } from 'class-validator';

export class CreatePortalSessionDto {
  @IsUrl()
  returnUrl: string;
}
