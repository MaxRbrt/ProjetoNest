// O @Type() do class-transformer lê metadata de tipo em tempo de execução;
// sem este import o Reflect.getMetadata não existe fora do bootstrap do Nest.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { resolvePagination, toPaginated } from './paginated';
import { PaginationQueryDto } from './pagination-query.dto';

describe('Paginação', () => {
  // ---------------------------------------------
  // Resolução de página e limite
  // ---------------------------------------------
  it('aplica os valores padrão quando a query vem vazia', () => {
    expect(resolvePagination({})).toEqual({
      page: 1,
      limit: 20,
      skip: 0,
      take: 20,
    });
  });

  it('calcula o skip a partir da página pedida', () => {
    expect(resolvePagination({ page: 3, limit: 10 })).toEqual({
      page: 3,
      limit: 10,
      skip: 20,
      take: 10,
    });
  });

  it('monta o envelope com os dados e o total', () => {
    expect(toPaginated(['a', 'b'], 137, 1, 20)).toEqual({
      data: ['a', 'b'],
      total: 137,
      page: 1,
      limit: 20,
    });
  });

  // ---------------------------------------------
  // Validação dos parâmetros recebidos
  // Converte de texto para número como o ValidationPipe global faria, para
  // garantir que query string válida passa e que o teto realmente barra.
  // ---------------------------------------------
  function validateQuery(query: Record<string, string>) {
    return validateSync(plainToInstance(PaginationQueryDto, query));
  }

  it('aceita page e limit numéricos vindos como texto', () => {
    expect(validateQuery({ page: '2', limit: '50' })).toHaveLength(0);
  });

  it('recusa limit acima do teto de 100', () => {
    expect(validateQuery({ limit: '101' })).not.toHaveLength(0);
  });

  it('recusa page menor que 1', () => {
    expect(validateQuery({ page: '0' })).not.toHaveLength(0);
  });

  it('recusa valor não numérico', () => {
    expect(validateQuery({ page: 'abc' })).not.toHaveLength(0);
  });

  it('recusa página absurdamente alta em notação científica', () => {
    expect(validateQuery({ page: '1e100' })).not.toHaveLength(0);
  });

  it('recusa página acima do teto de 10000', () => {
    expect(validateQuery({ page: '10001' })).not.toHaveLength(0);
  });

  it('aceita a última página dentro do teto', () => {
    expect(validateQuery({ page: '10000' })).toHaveLength(0);
  });
});
