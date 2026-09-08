import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const PAGINA_PADRAO = 1;
export const LIMITE_PADRAO = 20;
export const LIMITE_MAXIMO = 100;
export const PAGINA_MAXIMA = 10_000;

// ---------------------------------------------
// Parâmetros de paginação das listagens
// O @Type é obrigatório: query string chega como texto e o ValidationPipe
// global não faz conversão implícita, então sem ele o @IsInt reprovaria.
// O teto de limite impede que uma única requisição peça a tabela inteira, e o
// teto de pagina impede um OFFSET absurdo: sem ele, pagina=1e100 passa no
// @IsInt e o banco recebe um deslocamento impraticável, respondendo com erro
// interno.
// ---------------------------------------------
export class ConsultaPaginadaDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINA_MAXIMA)
  pagina?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIMITE_MAXIMO)
  limite?: number;
}
