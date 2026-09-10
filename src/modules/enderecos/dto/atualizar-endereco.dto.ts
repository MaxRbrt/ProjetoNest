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
// Atualização parcial de endereço
// Mesmas regras de CriarEnderecoDto, todas opcionais.
// ---------------------------------------------
export class AtualizarEnderecoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  apelido?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  destinatario?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @Matches(/^\d{8}$/, { message: 'CEP precisa ter 8 dígitos.' })
  cep?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  logradouro?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  numero?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  complemento?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  bairro?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  cidade?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsIn(UFS_VALIDAS, { message: 'UF inválida.' })
  uf?: Uf;

  @IsOptional()
  @IsBoolean()
  principal?: boolean;
}
