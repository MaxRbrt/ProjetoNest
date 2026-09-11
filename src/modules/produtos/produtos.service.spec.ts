import { ConflictException } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { CategoriasService } from '../categorias/categorias.service';
import { Produto } from './produto.entity';
import { ProdutosService } from './produtos.service';
import { ArmazenamentoDeImagens } from './imagens/armazenamento-de-imagens';

describe('ProdutosService', () => {
  it('converte a violação de chave estrangeira concorrente em conflito de domínio', async () => {
    const erroDeChaveEstrangeira = new QueryFailedError(
      'DELETE FROM products',
      [],
      Object.assign(new Error('foreign key violation'), { code: '23503' }),
    );
    const repositorio = {
      findOneBy: jest
        .fn()
        .mockResolvedValue({ id: 9, nomeDoArquivoDaImagem: null }),
      manager: { countBy: jest.fn().mockResolvedValue(0) },
      delete: jest.fn().mockRejectedValue(erroDeChaveEstrangeira),
    } as unknown as Repository<Produto>;
    const servico = new ProdutosService(
      repositorio,
      {} as CategoriasService,
      {} as ArmazenamentoDeImagens,
    );

    await expect(servico.remover(9)).rejects.toThrow(ConflictException);
  });
});
