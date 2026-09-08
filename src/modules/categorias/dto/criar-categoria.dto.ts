import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// ---------------------------------------------
// Criação de categoria
// O trim acontece antes da validação: sem ele, "   " passaria pelo IsNotEmpty
// e gravaria um nome em branco. O MaxLength espelha o varchar da coluna,
// transformando estouro de tamanho em 400 em vez de erro do banco.
// ---------------------------------------------
export class CriarCategoriaDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nome: string;
}
