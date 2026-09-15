import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Categoria } from '../../src/modules/categorias/categoria.entity';
import { CategoriasService } from '../../src/modules/categorias/categorias.service';
import { ArmazenamentoEmDisco } from '../../src/modules/produtos/imagens/armazenamento-em-disco';
import { Produto } from '../../src/modules/produtos/produto.entity';
import { ProdutosService } from '../../src/modules/produtos/produtos.service';
import { abrirBancoDeTeste, fecharBancoDeTeste, limparTabelas } from './ambiente';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------
// Ordenação do catálogo
// A ordem precisa vir do banco, não de reordenação em memória: a listagem é
// paginada, e ordenar só a página já carregada devolveria "os mais baratos
// desta página", não os mais baratos do catálogo — errado de um jeito que
// passa despercebido enquanto houver poucos produtos.
// ---------------------------------------------
describe('Catálogo — ordenação (integração)', () => {
  let conexao: DataSource;
  let produtosService: ProdutosService;

  beforeAll(async () => {
    conexao = await abrirBancoDeTeste();
  });

  afterAll(async () => {
    await fecharBancoDeTeste();
  });

  beforeEach(async () => {
    await limparTabelas(conexao);
    const diretorio = await mkdtemp(join(tmpdir(), 'catalogo-'));
    produtosService = new ProdutosService(
      conexao.getRepository(Produto),
      new CategoriasService(conexao.getRepository(Categoria)),
      new ArmazenamentoEmDisco(diretorio),
    );
    const categoria = await conexao
      .getRepository(Categoria)
      .save(conexao.getRepository(Categoria).create({ nome: 'Periféricos' }));

    for (const [nome, precoEmCentavos] of [
      ['Teclado', 25000],
      ['Monitor', 120000],
      ['Mousepad', 5000],
      ['Teclado', 90000],
    ] as const) {
      await produtosService.criar({
        nome,
        precoEmCentavos,
        estoque: 5,
        categoriaId: categoria.id,
      });
    }
  });

  it('ordena por preço crescente', async () => {
    const pagina = await produtosService.listar({
      ordenarPor: 'preco',
      direcao: 'asc',
    });
    expect(pagina.dados.map((p) => p.nome)).toEqual([
      'Mousepad',
      'Teclado',
      'Teclado',
      'Monitor',
    ]);
  });

  it('ordena por preço decrescente', async () => {
    const pagina = await produtosService.listar({
      ordenarPor: 'preco',
      direcao: 'desc',
    });
    expect(pagina.dados.map((p) => p.nome)).toEqual([
      'Monitor',
      'Teclado',
      'Teclado',
      'Mousepad',
    ]);
  });

  it('ordena por nome respeitando a direção', async () => {
    const pagina = await produtosService.listar({
      ordenarPor: 'nome',
      direcao: 'asc',
    });
    expect(pagina.dados.map((p) => p.nome)).toEqual([
      'Monitor',
      'Mousepad',
      'Teclado',
      'Teclado',
    ]);
  });

  it('sem ordenação explícita mantém a ordem estável por id', async () => {
    const pagina = await produtosService.listar({});
    expect(pagina.dados.map((p) => p.nome)).toEqual([
      'Teclado',
      'Monitor',
      'Mousepad',
      'Teclado',
    ]);
  });

  // ---------------------------------------------
  // Desempate por id em campo ordenado repetido
  // Sem o desempate por id, dois registros com o mesmo valor no campo
  // ordenado podem sair em ordem diferente entre consultas, e a paginação
  // passa a repetir ou omitir produto — falha que só aparece quando o
  // catálogo cresce. Os dois "Teclado" da fixture têm preços diferentes mas
  // o mesmo nome, então ordenar por nome empata e só o id decide quem vem
  // primeiro; a ordem tem que ser idêntica em duas chamadas seguidas.
  // ---------------------------------------------
  it('desempata por id quando o campo ordenado se repete', async () => {
    const primeira = await produtosService.listar({
      ordenarPor: 'nome',
      direcao: 'asc',
    });
    const segunda = await produtosService.listar({
      ordenarPor: 'nome',
      direcao: 'asc',
    });

    const idsDosTeclados = (pagina: typeof primeira) =>
      pagina.dados.filter((p) => p.nome === 'Teclado').map((p) => p.id);

    expect(idsDosTeclados(primeira)).toHaveLength(2);
    expect(idsDosTeclados(primeira)).toEqual([...idsDosTeclados(primeira)].sort((a, b) => a - b));
    expect(idsDosTeclados(segunda)).toEqual(idsDosTeclados(primeira));
  });
});
