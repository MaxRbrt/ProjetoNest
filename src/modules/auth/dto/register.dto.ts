import { EmailDto } from './email.dto';
import { SenhaValida } from '../password-policy';

export class RegisterDto extends EmailDto {
  @SenhaValida()
  password: string;
}
