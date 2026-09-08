import { EmailDto } from './email.dto';
import { SenhaValida } from '../politica-de-senha';

export class CadastrarDto extends EmailDto {
  @SenhaValida()
  senha: string;
}
