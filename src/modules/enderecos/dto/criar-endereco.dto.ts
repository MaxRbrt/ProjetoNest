import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { UFS_VALIDAS, type Uf } from './uf';

// ---------------------------------------------
// Criação de endereço
// O CEP chega da interface com ou sem hífen; a normalização remove qualquer
// caractere não numérico antes de validar o formato de 8 dígitos, para não
// duplicar a mesma regra em máscara-com-hífen e máscara-sem-hífen.
// ---------------------------------------------
export class CriarEnderecoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  apelido: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  destinatario: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @Matches(/^\d{8}$/, { message: 'CEP precisa ter 8 dígitos.' })
  cep: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  logradouro: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  numero: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  complemento?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  bairro: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  cidade: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsIn(UFS_VALIDAS, { message: 'UF inválida.' })
  uf: Uf;

  @IsOptional()
  @IsBoolean()
  principal?: boolean;
}
