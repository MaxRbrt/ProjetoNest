import { IsString, Matches } from 'class-validator';

export class VerificarEmailDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  token: string;
}
