import { IsString, Matches } from 'class-validator';

export class VerifyEmailDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  token: string;
}
