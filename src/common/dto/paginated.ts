import {
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  PaginationQueryDto,
} from './pagination-query.dto';

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// ---------------------------------------------
// Tradução dos parâmetros de página para skip/take
// Centraliza a aplicação dos defaults num lugar só: cada listagem que
// resolvesse page/limit por conta própria poderia divergir do teto e das
// regras das outras, e o cliente veria comportamento inconsistente.
// ---------------------------------------------
export function resolvePagination(query: PaginationQueryDto): {
  page: number;
  limit: number;
  skip: number;
  take: number;
} {
  const page = query.page ?? DEFAULT_PAGE;
  const limit = query.limit ?? DEFAULT_LIMIT;
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

// ---------------------------------------------
// Montagem do envelope devolvido pelas listagens
// ---------------------------------------------
export function toPaginated<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): Paginated<T> {
  return { data, total, page, limit };
}
