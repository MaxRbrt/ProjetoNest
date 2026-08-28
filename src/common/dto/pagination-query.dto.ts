import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

// ---------------------------------------------
// Parâmetros de paginação das listagens
// O @Type é obrigatório: query string chega como texto e o ValidationPipe
// global não faz conversão implícita, então sem ele o @IsInt reprovaria.
// O teto de limit impede que uma única requisição peça a tabela inteira.
// ---------------------------------------------
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;
}
