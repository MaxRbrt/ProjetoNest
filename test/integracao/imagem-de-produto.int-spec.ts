import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { Categoria } from '../../src/modules/categorias/categoria.entity';
import { CategoriasService } from '../../src/modules/categorias/categorias.service';
import { ArmazenamentoEmDisco } from '../../src/modules/produtos/imagens/armazenamento-em-disco';
import { Produto } from '../../src/modules/produtos/produto.entity';
import { ProdutosService } from '../../src/modules/produtos/produtos.service';
import { abrirBancoDeTeste, fecharBancoDeTeste, limparTabelas } from './ambiente';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('conteudo-png-de-teste'),
]);
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from('conteudo-jpeg-de-teste'),
]);

// ---------------------------------------------
// Imagem de produto contra Postgres real e disco real
// O diretório é temporário e novo a cada teste: o que precisa ser provado é
// que arquivo e coluna andam juntos — trocar a imagem não pode deixar o
// arquivo antigo para trás, e remover o produto não pode deixar arquivo
// órfão. Nenhuma das duas garantias sobrevive a um mock de fs.
// ---------------------------------------------
describe('Imagem de produto (integração)', () => {
  let conexao: DataSource;
  let produtosService: ProdutosService;
  let armazenamento: ArmazenamentoEmDisco;
  let diretorio: string;
  let produto: Produto;

  beforeAll(async () => {
    conexao = await abrirBancoDeTeste();
  });

  afterAll(async () => {
    await fecharBancoDeTeste();
  });

  beforeEach(async () => {
    await limparTabelas(conexao);
    diretorio = await mkdtemp(join(tmpdir(), 'imagem-produto-'));

    const categoriasService = new CategoriasService(
      conexao.getRepository(Categoria),
    );
    armazenamento = new ArmazenamentoEmDisco(diretorio);
    produtosService = new ProdutosService(
      conexao.getRepository(Produto),
      categoriasService,
      armazenamento,
    );

    const categoria = await conexao
      .getRepository(Categoria)
      .save(conexao.getRepository(Categoria).create({ nome: 'Categoria teste' }));
    produto = await produtosService.criar({
      nome: 'Produto com foto',
      precoEmCentavos: 5000,
      estoque: 3,
      categoriaId: categoria.id,
    });
  });

  afterEach(async () => {
    await rm(diretorio, { recursive: true, force: true });
  });

  it('grava o arquivo e aponta a coluna para ele', async () => {
    const salvo = await produtosService.definirImagem(produto.id, PNG);

    expect(salvo.nomeDoArquivoDaImagem).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(await readdir(diretorio)).toEqual([salvo.nomeDoArquivoDaImagem]);
  });

  it('trocar a imagem apaga o arquivo anterior', async () => {
    const primeiro = await produtosService.definirImagem(produto.id, PNG);
    const segundo = await produtosService.definirImagem(produto.id, JPEG);

    expect(segundo.nomeDoArquivoDaImagem).not.toBe(primeiro.nomeDoArquivoDaImagem);
    expect(await readdir(diretorio)).toEqual([segundo.nomeDoArquivoDaImagem]);
  });

  it('recusa arquivo que não é imagem, sem gravar nada', async () => {
    await expect(
      produtosService.definirImagem(produto.id, Buffer.from('<svg></svg>')),
    ).rejects.toThrow(BadRequestException);

    expect(await readdir(diretorio)).toEqual([]);
    const recarregado = await produtosService.buscarPorId(produto.id);
    expect(recarregado.nomeDoArquivoDaImagem).toBeNull();
  });

  it('remover a imagem limpa a coluna e o disco', async () => {
    await produtosService.definirImagem(produto.id, PNG);

    const semImagem = await produtosService.removerImagem(produto.id);

    expect(semImagem.nomeDoArquivoDaImagem).toBeNull();
    expect(await readdir(diretorio)).toEqual([]);
  });

  it('remover o produto apaga o arquivo junto', async () => {
    await produtosService.definirImagem(produto.id, PNG);

    await produtosService.remover(produto.id);

    expect(await readdir(diretorio)).toEqual([]);
  });

  it('lê a imagem com o Content-Type derivado do conteúdo gravado', async () => {
    await produtosService.definirImagem(produto.id, JPEG);

    const imagem = await produtosService.lerImagem(produto.id);

    expect(imagem?.contentType).toBe('image/jpeg');
    expect(imagem?.conteudo).toEqual(JPEG);
  });

  it('produto sem imagem devolve null em vez de erro', async () => {
    await expect(produtosService.lerImagem(produto.id)).resolves.toBeNull();
  });

  it('produto inexistente continua sendo 404 nos três caminhos', async () => {
    await expect(produtosService.definirImagem(999999, PNG)).rejects.toThrow(
      NotFoundException,
    );
    await expect(produtosService.removerImagem(999999)).rejects.toThrow(
      NotFoundException,
    );
    await expect(produtosService.lerImagem(999999)).rejects.toThrow(
      NotFoundException,
    );
  });

  // ---------------------------------------------
  // Concorrência entre upload e alteração de estoque
  // A janela que precisa ficar protegida não é "antes de chamar
  // definirImagem" — definirImagem já começa lendo o produto do banco
  // (buscarPorId), então uma alteração concorrente anterior a essa chamada já
  // seria enxergada por qualquer implementação, com update() ou com save().
  // A janela real é ENTRE essa leitura inicial e a escrita da coluna de
  // imagem, que é exatamente o tempo do I/O de disco em
  // armazenamento.gravar(). Por isso o update de estoque é disparado de
  // DENTRO de um spy em armazenamento.gravar(), não antes de chamar o
  // serviço: só assim a alteração concorrente acontece depois que o produto
  // já foi lido em memória (ainda com estoque 3) e antes da escrita da
  // coluna — a única ordem que expõe a diferença entre update() de uma
  // coluna e save() da entidade inteira. Se alguém voltar a usar save(), o
  // objeto em memória (estoque 3, lido antes do spy rodar) sobrescreve o
  // estoque 99 gravado pelo concorrente, e este teste falha mostrando 3.
  // ---------------------------------------------
  it('não sobrescreve alteração concorrente de estoque feita durante o upload', async () => {
    jest.spyOn(armazenamento, 'gravar').mockImplementation(async (conteudo, extensao) => {
      await conexao.getRepository(Produto).update(produto.id, { estoque: 99 });
      return ArmazenamentoEmDisco.prototype.gravar.call(
        armazenamento,
        conteudo,
        extensao,
      );
    });

    await produtosService.definirImagem(produto.id, PNG);

    const recarregado = await produtosService.buscarPorId(produto.id);
    expect(recarregado.estoque).toBe(99);
    expect(recarregado.nomeDoArquivoDaImagem).toMatch(/^[0-9a-f-]{36}\.png$/);
  });

  // ---------------------------------------------
  // Concorrência entre edição e troca de imagem
  // A edição lê a entidade antes de salvar. Se ela persistir a entidade inteira
  // depois que outro fluxo já trocou a imagem, restaura a referência antiga,
  // cujo arquivo acabou de ser apagado. O update parcial precisa preservar a
  // coluna que a edição não recebeu no DTO.
  // ---------------------------------------------
  it('não restaura referência de imagem removida por troca concorrente', async () => {
    const primeira = await produtosService.definirImagem(produto.id, PNG);
    const repositorio = conexao.getRepository(Produto);
    const salvarOriginal = repositorio.save.bind(repositorio);
    const atualizarOriginal = repositorio.update.bind(repositorio);
    let trocaExecutada = false;

    async function trocarImagemNoMeioDaEdicao(): Promise<void> {
      if (trocaExecutada) return;
      trocaExecutada = true;
      await produtosService.definirImagem(produto.id, JPEG);
    }

    jest.spyOn(repositorio, 'save').mockImplementation(async (entidade) => {
      await trocarImagemNoMeioDaEdicao();
      return salvarOriginal(entidade);
    });
    jest.spyOn(repositorio, 'update').mockImplementation(async (...argumentos) => {
      await trocarImagemNoMeioDaEdicao();
      return atualizarOriginal(...argumentos);
    });

    await produtosService.atualizar(produto.id, { nome: 'Produto editado' });

    const recarregado = await produtosService.buscarPorId(produto.id);
    expect(recarregado.nomeDoArquivoDaImagem).not.toBe(
      primeira.nomeDoArquivoDaImagem,
    );
    expect(await readdir(diretorio)).toEqual([
      recarregado.nomeDoArquivoDaImagem,
    ]);
  });

  // ---------------------------------------------
  // Concorrência entre dois uploads
  // Ambos podem ler a mesma imagem anterior antes de gravar no disco. A
  // troca precisa aceitar apenas quem ainda aponta para esse nome; sem essa
  // condição, o segundo update sobrescreve a coluna e deixa o primeiro arquivo
  // novo órfão.
  // ---------------------------------------------
  it('limpa o arquivo do upload que perde a corrida de substituição', async () => {
    let liberarPrimeiraGravacao!: () => void;
    let avisarPrimeiraGravacao!: () => void;
    let avisarSegundaGravacao!: () => void;
    const primeiraGravacaoEntrou = new Promise<void>((resolver) => {
      avisarPrimeiraGravacao = resolver;
    });
    const segundaGravacaoEntrou = new Promise<void>((resolver) => {
      avisarSegundaGravacao = resolver;
    });
    const primeiraGravacaoLiberada = new Promise<void>((resolver) => {
      liberarPrimeiraGravacao = resolver;
    });
    let chamadas = 0;

    jest.spyOn(armazenamento, 'gravar').mockImplementation(async (...argumentos) => {
      chamadas += 1;
      if (chamadas === 1) {
        avisarPrimeiraGravacao();
        await primeiraGravacaoLiberada;
      } else {
        avisarSegundaGravacao();
      }
      return ArmazenamentoEmDisco.prototype.gravar.call(
        armazenamento,
        ...argumentos,
      );
    });

    const primeiroUpload = produtosService.definirImagem(produto.id, PNG);
    await primeiraGravacaoEntrou;
    const segundoUpload = produtosService.definirImagem(produto.id, JPEG);
    await segundaGravacaoEntrou;
    liberarPrimeiraGravacao();

    const resultados = await Promise.allSettled([primeiroUpload, segundoUpload]);

    expect(resultados.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(resultados.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    const recarregado = await produtosService.buscarPorId(produto.id);
    expect(await readdir(diretorio)).toEqual([
      recarregado.nomeDoArquivoDaImagem,
    ]);
  });
});
