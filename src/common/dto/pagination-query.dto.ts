import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
export const MAX_PAGE = 10_000;

// ---------------------------------------------
// Parâmetros de paginação das listagens
// O @Type é obrigatório: query string chega como texto e o ValidationPipe
// global não faz conversão implícita, então sem ele o @IsInt reprovaria.
// O teto de limit impede que uma única requisição peça a tabela inteira, e o
// teto de page impede um OFFSET absurdo: sem ele, page=1e100 passa no @IsInt
// e o banco recebe um deslocamento impraticável, respondendo com erro interno.
// ---------------------------------------------
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;
}
