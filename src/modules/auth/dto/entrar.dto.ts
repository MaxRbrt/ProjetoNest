import { IsString, MaxLength } from 'class-validator';
import { EmailDto } from './email.dto';

export class EntrarDto extends EmailDto {
  @IsString()
  @MaxLength(128)
  senha: string;
}
