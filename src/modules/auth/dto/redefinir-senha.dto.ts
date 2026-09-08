import { IsString, Matches } from 'class-validator';
import { SenhaValida } from '../politica-de-senha';

export class RedefinirSenhaDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  token: string;

  @SenhaValida()
  novaSenha: string;
}
