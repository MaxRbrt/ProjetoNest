import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  FindOptionsWhere,
  ILike,
  IsNull,
  QueryFailedError,
  Repository,
} from 'typeorm';
import {
  Paginado,
  resolverPaginacao,
  paraPaginado,
} from '../../common/dto/paginado';
import { Produto } from './produto.entity';
import { CriarProdutoDto } from './dto/criar-produto.dto';
import { ConsultaDeProdutosDto } from './dto/consulta-de-produtos.dto';
import { AtualizarProdutoDto } from './dto/atualizar-produto.dto';
import { CategoriasService } from '../categorias/categorias.service';
import { ItemDoPedido } from '../pedidos/entities/item-do-pedido.entity';
import { ARMAZENAMENTO_DE_IMAGENS } from './imagens/armazenamento-de-imagens';
import type { ArmazenamentoDeImagens } from './imagens/armazenamento-de-imagens';
import { detectarTipoDeImagem } from './imagens/deteccao-de-tipo-de-imagem';

function ehViolacaoDeChaveEstrangeira(erro: unknown): boolean {
  return (
    erro instanceof QueryFailedError &&
    (erro.driverError as Error & { code?: string }).code === '23503'
  );
}

@Injectable()
export class ProdutosService {
  private readonly logger = new Logger(ProdutosService.name);

  constructor(
    @InjectRepository(Produto)
    private readonly repositorioDeProdutos: Repository<Produto>,
    private readonly categoriasService: CategoriasService,
    @Inject(ARMAZENAMENTO_DE_IMAGENS)
    private readonly armazenamento: ArmazenamentoDeImagens,
  ) {}

  // ---------------------------------------------
  // Listagem paginada de produtos, com filtro e busca
  // Os filtros entram no where e não em memória: filtrar depois de paginar
  // devolveria página incompleta e um total que não corresponde ao resultado.
  // Nome em branco é tratado como filtro ausente, para que um campo de busca
  // vazio na vitrine não vire uma busca por espaço. A ordenação por id é
  // obrigatória: sem ORDER BY o Postgres não garante ordem entre consultas, e
  // o mesmo produto poderia aparecer em duas páginas ou sumir de todas.
  // ---------------------------------------------
  async listar(query: ConsultaDeProdutosDto): Promise<Paginado<Produto>> {
    const { pagina, limite, skip, take } = resolverPaginacao(query);
    const where: FindOptionsWhere<Produto> = {};

    if (query.categoriaId !== undefined) {
      where.categoriaId = query.categoriaId;
    }
    const nome = query.nome?.trim();
    if (nome) {
      where.nome = ILike(`%${nome}%`);
    }

    const [dados, total] = await this.repositorioDeProdutos.findAndCount({
      where,
      order: { id: 'ASC' },
      skip,
      take,
    });
    return paraPaginado(dados, total, pagina, limite);
  }

  // ---------------------------------------------
  // Consulta de produto por identificador
  // ---------------------------------------------
  async buscarPorId(id: number): Promise<Produto> {
    const produto = await this.repositorioDeProdutos.findOneBy({ id });
    if (!produto) {
      throw new NotFoundException(`Produto ${id} não encontrado`);
    }
    return produto;
  }

  // ---------------------------------------------
  // Criação de produto
  // ---------------------------------------------
  async criar(dto: CriarProdutoDto): Promise<Produto> {
    await this.categoriasService.buscarPorId(dto.categoriaId);
    const produto = this.repositorioDeProdutos.create(dto);
    return this.repositorioDeProdutos.save(produto);
  }

  // ---------------------------------------------
  // Atualização de produto
  // A persistência altera apenas os campos recebidos no DTO. Salvar a entidade
  // inteira carregada acima poderia restaurar uma imagem antiga se outro fluxo
  // a trocasse enquanto a edição valida a categoria; a troca apaga o arquivo
  // anterior e deixaria a coluna apontando para um nome inexistente.
  // ---------------------------------------------
  async atualizar(id: number, dto: AtualizarProdutoDto): Promise<Produto> {
    const produto = await this.buscarPorId(id);
    if (dto.categoriaId !== undefined) {
      await this.categoriasService.buscarPorId(dto.categoriaId);
    }
    if (Object.keys(dto).length === 0) {
      return produto;
    }
    await this.repositorioDeProdutos.update(id, dto);
    return this.buscarPorId(id);
  }

  // ---------------------------------------------
  // Remoção com checagem de pedidos
  // A checagem explícita converte a dependência em um conflito de negócio
  // compreensível antes de tentar violar a chave estrangeira. A imagem
  // associada (se houver) só é apagada depois que a remoção condicional do
  // produto já foi confirmada: se uma troca concorrente alterar a imagem,
  // o delete não afeta linha alguma e o arquivo atual continua intacto. A
  // falha da limpeza em si é
  // tolerada pelo mesmo motivo explicado em definirImagem/removerImagem.
  // ---------------------------------------------
  async remover(id: number): Promise<void> {
    const produto = await this.buscarPorId(id);
    const orderItemsCount = await this.repositorioDeProdutos.manager.countBy(
      ItemDoPedido,
      { produtoId: id },
    );
    if (orderItemsCount > 0) {
      throw new ConflictException(
        `Não é possível remover o produto ${id}: existem pedidos vinculados a ele`,
      );
    }
    const nomeDoArquivo = produto.nomeDoArquivoDaImagem;
    let resultado;
    try {
      resultado = await this.repositorioDeProdutos.delete({
        id,
        nomeDoArquivoDaImagem: nomeDoArquivo ?? IsNull(),
      });
    } catch (erro) {
      if (ehViolacaoDeChaveEstrangeira(erro)) {
        throw new ConflictException(
          `Não é possível remover o produto ${id}: existem pedidos vinculados a ele`,
        );
      }
      throw erro;
    }
    if (resultado.affected !== 1) {
      throw new ConflictException(
        `Não é possível remover o produto ${id}: a imagem foi alterada por outra operação`,
      );
    }

    if (nomeDoArquivo) {
      await this.apagarImagemComTolerancia(nomeDoArquivo);
    }
  }

  // ---------------------------------------------
  // Definição da imagem do produto
  // O tipo sai da assinatura de bytes, nunca do mimetype declarado no
  // upload. A ordem das três operações é deliberada: grava o arquivo novo,
  // aponta a coluna para ele e só então apaga o antigo. Apagar antes deixaria
  // o produto apontando para um arquivo inexistente se a gravação falhasse no
  // meio; nesta ordem, a falha no pior caso deixa um arquivo órfão em disco,
  // que não quebra nenhuma tela.
  //
  // A escrita que aponta a coluna para o arquivo novo é um UPDATE de uma
  // única coluna, condicionado também ao nome lido no começo. Não usa save()
  // da entidade inteira: o I/O de disco deixa uma janela em que estoque ou
  // preço podem mudar, e salvar a entidade carregada restauraria o valor
  // antigo. A condição evita também que dois uploads se sobrescrevam: quem
  // perder limpa o arquivo que acabou de gravar e recebe 409. Por isso o
  // produto é recarregado do banco depois do UPDATE, refletindo o estado
  // atual, inclusive qualquer mudança concorrente de outro campo.
  //
  // A limpeza do arquivo anterior acontece DEPOIS de a coluna já estar
  // apontando para o novo, e por isso sua falha é isolada (ver
  // apagarImagemComTolerancia): ArmazenamentoEmDisco.apagar() relança erros
  // de disco que não sejam arquivo ausente, e deixar essa exceção subir
  // derrubaria com erro um upload que na prática já funcionou.
  //
  // Essa limpeza roda ANTES do buscarPorId() que monta o retorno, e não
  // depois: buscarPorId() lança NotFoundException se o produto tiver sido
  // removido por outra requisição entre o UPDATE e este ponto — 404 correto
  // nesse caso —, e a limpeza do arquivo anterior não pode depender de o
  // produto ainda existir para ser executada. Ficar sem limpar o arquivo
  // órfão, e sem nem o aviso de log, seria pior do que a leitura final
  // falhar depois de a limpeza já ter rodado.
  // ---------------------------------------------
  async definirImagem(id: number, conteudo: Buffer): Promise<Produto> {
    const produto = await this.buscarPorId(id);
    const tipo = detectarTipoDeImagem(conteudo);
    if (!tipo) {
      throw new BadRequestException(
        'Arquivo não é uma imagem JPEG, PNG ou WebP válida.',
      );
    }

    const anterior = produto.nomeDoArquivoDaImagem;
    const nomeNovo = await this.armazenamento.gravar(conteudo, tipo.extensao);
    const resultado = await this.repositorioDeProdutos.update({
      id,
      nomeDoArquivoDaImagem: anterior ?? IsNull(),
    }, {
      nomeDoArquivoDaImagem: nomeNovo,
    });
    if (resultado.affected !== 1) {
      await this.apagarImagemComTolerancia(nomeNovo);
      const aindaExiste = await this.repositorioDeProdutos.existsBy({ id });
      if (!aindaExiste) {
        throw new NotFoundException(`Produto ${id} não encontrado`);
      }
      throw new ConflictException(
        `A imagem do produto ${id} foi alterada por outra operação. Atualize e tente novamente.`,
      );
    }

    if (anterior) {
      await this.apagarImagemComTolerancia(anterior);
    }
    return this.buscarPorId(id);
  }

  // ---------------------------------------------
  // Remoção da imagem do produto
  // Mesmo raciocínio de definirImagem: a coluna é limpa com um UPDATE de
  // uma única coluna, não um save() da entidade inteira, para não arriscar
  // sobrescrever estoque ou preço alterados por uma operação concorrente. O
  // produto é recarregado para o retorno refletir o estado atual. A limpeza
  // do arquivo antigo (via apagarImagemComTolerancia) roda antes desse
  // recarregamento, pelo mesmo motivo de definirImagem: buscarPorId() pode
  // lançar NotFoundException se o produto tiver sido removido nesse
  // intervalo, e a limpeza não pode depender de o produto ainda existir.
  // ---------------------------------------------
  async removerImagem(id: number): Promise<Produto> {
    const produto = await this.buscarPorId(id);
    const anterior = produto.nomeDoArquivoDaImagem;
    const resultado = await this.repositorioDeProdutos.update({
      id,
      nomeDoArquivoDaImagem: anterior ?? IsNull(),
    }, {
      nomeDoArquivoDaImagem: null,
    });
    if (resultado.affected !== 1) {
      throw new ConflictException(
        `A imagem do produto ${id} foi alterada por outra operação. Atualize e tente novamente.`,
      );
    }

    if (anterior) {
      await this.apagarImagemComTolerancia(anterior);
    }
    return this.buscarPorId(id);
  }

  // ---------------------------------------------
  // Leitura da imagem para entrega
  // Devolve null tanto para produto sem imagem quanto para arquivo que sumiu
  // do disco: para quem pede a imagem, os dois casos são a mesma coisa, e o
  // segundo não é erro do servidor a ponto de virar 500.
  // ---------------------------------------------
  async lerImagem(
    id: number,
  ): Promise<{ conteudo: Buffer; contentType: string } | null> {
    const produto = await this.buscarPorId(id);
    if (!produto.nomeDoArquivoDaImagem) {
      return null;
    }
    const conteudo = await this.armazenamento.ler(
      produto.nomeDoArquivoDaImagem,
    );
    if (!conteudo) {
      return null;
    }
    const tipo = detectarTipoDeImagem(conteudo);
    return {
      conteudo,
      contentType: tipo?.contentType ?? 'application/octet-stream',
    };
  }

  // ---------------------------------------------
  // Limpeza tolerante de arquivo de imagem órfão
  // Usada depois que o estado novo (produto salvo, ou produto removido) já
  // está persistido com sucesso. ArmazenamentoEmDisco.apagar() não lança
  // para arquivo ausente, mas relança qualquer outra falha de disco
  // (permissão, disco cheio); se deixássemos isso subir aqui, o chamador
  // veria uma exceção para uma operação que já tinha terminado bem. Por
  // isso o erro é só registrado: o pior resultado é um arquivo órfão em
  // disco, que é um problema menor do que reportar falha falsa ao usuário.
  // ---------------------------------------------
  private async apagarImagemComTolerancia(nome: string): Promise<void> {
    try {
      await this.armazenamento.apagar(nome);
    } catch (erro) {
      this.logger.warn(
        `Falha ao apagar arquivo de imagem órfão "${nome}": ${(erro as Error).message}`,
      );
    }
  }
}
