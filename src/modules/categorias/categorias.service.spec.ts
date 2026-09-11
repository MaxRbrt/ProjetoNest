import { ConflictException } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { CategoriasService } from './categorias.service';
import { Categoria } from './categoria.entity';

describe('CategoriasService', () => {
  it('converte a violação de chave estrangeira concorrente em conflito de domínio', async () => {
    const erroDeChaveEstrangeira = new QueryFailedError(
      'DELETE FROM categories',
      [],
      Object.assign(new Error('foreign key violation'), { code: '23503' }),
    );
    const repositorio = {
      findOneBy: jest.fn().mockResolvedValue({ id: 7 }),
      manager: { countBy: jest.fn().mockResolvedValue(0) },
      remove: jest.fn().mockRejectedValue(erroDeChaveEstrangeira),
    } as unknown as Repository<Categoria>;
    const servico = new CategoriasService(repositorio);

    await expect(servico.remover(7)).rejects.toThrow(ConflictException);
  });
});
