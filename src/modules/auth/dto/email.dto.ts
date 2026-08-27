import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';

export class EmailDto {
  // ---------------------------------------------
  // Normalização do endereço de email
  // ---------------------------------------------
  // A transformação fica restrita ao email para não alterar senhas
  // recebidas pelas classes derivadas.
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Informe um email válido.' })
  @MaxLength(254)
  email: string;
}
