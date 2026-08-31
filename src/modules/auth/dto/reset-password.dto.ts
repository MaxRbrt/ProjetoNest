import { IsString, Matches } from 'class-validator';
import { SenhaValida } from '../password-policy';

export class ResetPasswordDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  token: string;

  @SenhaValida()
  newPassword: string;
}
