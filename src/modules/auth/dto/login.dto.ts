import { IsString, MaxLength } from 'class-validator';
import { EmailDto } from './email.dto';

export class LoginDto extends EmailDto {
  @IsString()
  @MaxLength(128)
  password: string;
}
