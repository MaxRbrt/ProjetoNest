import { Type, applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';

// ---------------------------------------------
// Documentação da resposta paginada
// A interface Paginado<T> é apagada em tempo de execução, então o gerador do
// OpenAPI não consegue descrevê-la sozinho e produziria uma resposta 200 sem
// schema nenhum. Este decorator monta o envelope à mão, com o array data
// referenciando o modelo concreto de cada rota.
// ---------------------------------------------
export function ApiPaginatedResponse(model: Type<unknown>) {
  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      schema: {
        type: 'object',
        required: ['data', 'total', 'page', 'limit'],
        properties: {
          data: {
            type: 'array',
            items: { $ref: getSchemaPath(model) },
          },
          total: {
            type: 'integer',
            description: 'Total de registros que atendem à consulta.',
            example: 137,
          },
          page: {
            type: 'integer',
            description: 'Página devolvida, começando em 1.',
            example: 1,
          },
          limit: {
            type: 'integer',
            description: 'Quantidade máxima de itens por página.',
            example: 20,
          },
        },
      },
    }),
  );
}
