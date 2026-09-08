import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// ---------------------------------------------
// Atualização de categoria
// O trim acontece antes da validação: sem ele, "   " passaria pelo IsNotEmpty
// e gravaria um nome em branco. O MaxLength espelha o varchar da coluna,
// transformando estouro de tamanho em 400 em vez de erro do banco.
// ---------------------------------------------
export class AtualizarCategoriaDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nome?: string;
}
