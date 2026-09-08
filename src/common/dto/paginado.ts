import {
  LIMITE_PADRAO,
  PAGINA_PADRAO,
  ConsultaPaginadaDto,
} from './consulta-paginada.dto';

export interface Paginado<T> {
  dados: T[];
  total: number;
  pagina: number;
  limite: number;
}

// ---------------------------------------------
// Tradução dos parâmetros de página para skip/take
// Centraliza a aplicação dos padrões num lugar só: cada listagem que
// resolvesse pagina/limite por conta própria poderia divergir do teto e das
// regras das outras, e o cliente veria comportamento inconsistente.
// ---------------------------------------------
export function resolverPaginacao(query: ConsultaPaginadaDto): {
  pagina: number;
  limite: number;
  skip: number;
  take: number;
} {
  const pagina = query.pagina ?? PAGINA_PADRAO;
  const limite = query.limite ?? LIMITE_PADRAO;
  return { pagina, limite, skip: (pagina - 1) * limite, take: limite };
}

// ---------------------------------------------
// Montagem do envelope devolvido pelas listagens
// ---------------------------------------------
export function paraPaginado<T>(
  dados: T[],
  total: number,
  pagina: number,
  limite: number,
): Paginado<T> {
  return { dados, total, pagina, limite };
}
