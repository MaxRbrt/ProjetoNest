import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';

export class EmailDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Informe um email válido.' })
  @MaxLength(254)
  email: string;
}
