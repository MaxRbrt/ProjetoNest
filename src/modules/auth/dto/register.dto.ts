import { IsString, MaxLength, MinLength } from 'class-validator';
import { EmailDto } from './email.dto';

export class RegisterDto extends EmailDto {
  @IsString()
  @MinLength(15)
  @MaxLength(128)
  password: string;
}
