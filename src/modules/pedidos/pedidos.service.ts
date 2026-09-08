import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import {
  Paginado,
  resolverPaginacao,
  paraPaginado,
} from '../../common/dto/paginado';
import { ConsultaPaginadaDto } from '../../common/dto/consulta-paginada.dto';
import { Pedido, SituacaoDoPedido } from './entities/pedido.entity';
import { ItemDoPedido } from './entities/item-do-pedido.entity';
import { Produto } from '../produtos/produto.entity';
import { Papel } from '../usuarios/usuario.entity';
import { UsuarioPublico } from '../usuarios/usuarios.service';
import { CriarPedidoDto, CriarItemDoPedidoDto } from './dto/criar-pedido.dto';
import { AtualizarSituacaoDoPedidoDto } from './dto/atualizar-situacao-do-pedido.dto';
import { ConsultaDePedidosDto } from './dto/consulta-de-pedidos.dto';

// ---------------------------------------------
// Hash do payload para conferência de Idempotency-Key
// Itens ordenados por productId: o mesmo carrinho gera o mesmo hash
// independente da ordem em que o cliente enviou os itens no corpo.
// ---------------------------------------------
export function hashDoPayloadDoPedido(itens: CriarItemDoPedidoDto[]): string {
  const normalized = [...itens]
    .sort((a, b) => a.produtoId - b.produtoId)
    .map((item) => `${item.produtoId}:${item.quantidade}`)
    .join(',');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

// ---------------------------------------------
// Transições permitidas do pedido
// CANCELADO não aparece como origem por ser terminal, e repetir o status
// atual também é recusado — quem chega aqui esperando mudar algo precisa
// saber que nada mudou. ADMIN é exigido para confirmar pagamento e para
// cancelar pedido já pago, que envolveria estorno financeiro.
// ---------------------------------------------
const ALLOWED_TRANSITIONS: ReadonlyArray<{
  from: SituacaoDoPedido;
  to: SituacaoDoPedido;
  adminOnly: boolean;
}> = [
  {
    from: SituacaoDoPedido.PENDENTE,
    to: SituacaoDoPedido.PAGO,
    adminOnly: true,
  },
  {
    from: SituacaoDoPedido.PENDENTE,
    to: SituacaoDoPedido.CANCELADO,
    adminOnly: false,
  },
  {
    from: SituacaoDoPedido.PAGO,
    to: SituacaoDoPedido.CANCELADO,
    adminOnly: true,
  },
];

function exigirTransicaoPermitida(
  from: SituacaoDoPedido,
  to: SituacaoDoPedido,
  usuario: UsuarioPublico,
): void {
  const transition = ALLOWED_TRANSITIONS.find(
    (candidate) => candidate.from === from && candidate.to === to,
  );
  if (!transition) {
    throw new ConflictException(
      `Não é possível mudar o pedido de ${from} para ${to}.`,
    );
  }
  if (transition.adminOnly && usuario.papel !== Papel.ADMIN) {
    throw new ForbiddenException(
      `Somente administrador pode mudar o pedido de ${from} para ${to}.`,
    );
  }
}

function ehViolacaoDeUnicidade(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === '23505'
  );
}

const IDEMPOTENCY_KEY_MAX_LENGTH = 128;

// ---------------------------------------------
// Validação da Idempotency-Key recebida via header
// Chave vazia (só espaços) ou maior que a coluna do banco vira 400 aqui,
// antes de qualquer consulta — sem isso, o retry falharia com erro interno
// (vazio some no teste de truthiness; excedente estoura o varchar(128)).
// ---------------------------------------------
function normalizarChaveDeIdempotencia(idempotencyKey?: string): string | null {
  if (idempotencyKey === undefined) {
    return null;
  }
  const trimmed = idempotencyKey.trim();
  if (!trimmed) {
    throw new BadRequestException('Idempotency-Key não pode ser vazia.');
  }
  if (trimmed.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw new BadRequestException(
      `Idempotency-Key excede o limite de ${IDEMPOTENCY_KEY_MAX_LENGTH} caracteres.`,
    );
  }
  return trimmed;
}

// ---------------------------------------------
// Validação de produto repetido no carrinho
// productId duplicado tornaria o hash do payload dependente da ordem dos
// itens enviados (o mesmo carrinho gerando hashes diferentes conforme o
// cliente reordena), então é rejeitado antes de calcular qualquer hash.
// ---------------------------------------------
function exigirProdutosSemRepeticao(itens: CriarItemDoPedidoDto[]): void {
  const ids = itens.map((item) => item.produtoId);
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestException(
      'Pedido contém o mesmo produto mais de uma vez.',
    );
  }
}

@Injectable()
export class PedidosService {
  constructor(
    @InjectRepository(Pedido)
    private readonly repositorioDePedidos: Repository<Pedido>,
  ) {}

  // ---------------------------------------------
  // Listagem paginada de pedidos
  // Administrador enxerga todos; cliente enxerga apenas os próprios. O filtro
  // de dono entra no where, antes de skip/take, para que a paginação recaia
  // somente sobre os pedidos que o usuário pode ver. A ordenação é obrigatória
  // e precisa desempatar por id: sem ORDER BY o Postgres não garante ordem
  // entre consultas, e pedidos criados no mesmo instante embaralhariam entre
  // páginas mesmo ordenando só por createdAt.
  // ---------------------------------------------
  async listar(
    usuario: UsuarioPublico,
    query: ConsultaDePedidosDto,
  ): Promise<Paginado<Pedido>> {
    const { pagina, limite, skip, take } = resolverPaginacao(query);
    const where: FindOptionsWhere<Pedido> =
      usuario.papel === Papel.ADMIN ? {} : { usuarioId: usuario.id };
    if (query.situacao) {
      where.situacao = query.situacao;
    }
    const [dados, total] = await this.repositorioDePedidos.findAndCount({
      where,
      relations: { itens: true },
      order: { criadoEm: 'DESC', id: 'DESC' },
      skip,
      take,
    });
    return paraPaginado(dados, total, pagina, limite);
  }

  // ---------------------------------------------
  // Consulta de pedido por identificador
  // O filtro de dono entra na própria consulta: pedido alheio não é encontrado
  // e resulta em 404. Um 403 revelaria que o pedido existe.
  // ---------------------------------------------
  async buscarPorId(id: number, usuario: UsuarioPublico): Promise<Pedido> {
    const pedido = await this.repositorioDePedidos.findOne({
      where:
        usuario.papel === Papel.ADMIN ? { id } : { id, usuarioId: usuario.id },
      relations: { itens: true },
    });
    if (!pedido) {
      throw new NotFoundException(`Pedido ${id} não encontrado`);
    }
    return pedido;
  }

  // ---------------------------------------------
  // Criação de pedido com baixa de estoque
  // Idempotency-Key opcional: mesma chave e mesmo payload devolve o pedido já
  // criado em vez de duplicar; mesma chave com payload diferente é 409. Sem
  // chave, o comportamento é o mesmo de antes (cada chamada cria um pedido).
  // Duas requisições com a mesma chave podem passar pela consulta inicial ao
  // mesmo tempo; só uma vence a restrição de unicidade (userId, idempotencyKey)
  // no insert — a perdedora cai no catch, busca de novo e devolve o pedido
  // que a vencedora já salvou, em vez de propagar o erro do banco. Produto
  // duplicado no carrinho e chave vazia/maior que 128 caracteres são 400
  // antes de qualquer consulta ou cálculo de hash.
  // ---------------------------------------------
  async criar(
    dto: CriarPedidoDto,
    usuario: UsuarioPublico,
    rawIdempotencyKey?: string,
  ): Promise<Pedido> {
    exigirProdutosSemRepeticao(dto.itens);
    const idempotencyKey = normalizarChaveDeIdempotencia(rawIdempotencyKey);
    const payloadHash = idempotencyKey
      ? hashDoPayloadDoPedido(dto.itens)
      : null;

    if (idempotencyKey) {
      const existing = await this.buscarPorChaveDeIdempotencia(
        usuario.id,
        idempotencyKey,
      );
      if (existing) {
        return this.resolverReenvioIdempotente(existing, payloadHash);
      }
    }

    try {
      return await this.rodarTransacaoDeCriacao(
        dto,
        usuario,
        idempotencyKey,
        payloadHash,
      );
    } catch (error) {
      if (idempotencyKey && ehViolacaoDeUnicidade(error)) {
        const winner = await this.buscarPorChaveDeIdempotencia(
          usuario.id,
          idempotencyKey,
        );
        if (winner) {
          return this.resolverReenvioIdempotente(winner, payloadHash);
        }
      }
      throw error;
    }
  }

  // ---------------------------------------------
  // Mudança de situação do pedido
  // Tudo roda em uma transação: o pedido é relido com lock de escrita para
  // que duas requisições concorrentes não decidam sobre o mesmo status e
  // estornem o estoque duas vezes. O filtro de dono entra na releitura, então
  // pedido alheio some e vira 404, sem revelar que existe. O estorno trava os
  // produtos em ordem crescente de productId, a mesma ordem usada na criação,
  // para que cancelar e criar em paralelo não se travem em deadlock.
  // ---------------------------------------------
  atualizarSituacao(
    id: number,
    dto: AtualizarSituacaoDoPedidoDto,
    usuario: UsuarioPublico,
  ): Promise<Pedido> {
    return this.repositorioDePedidos.manager.transaction(async (manager) => {
      const pedido = await manager.findOne(Pedido, {
        where:
          usuario.papel === Papel.ADMIN
            ? { id }
            : { id, usuarioId: usuario.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!pedido) {
        throw new NotFoundException(`Pedido ${id} não encontrado`);
      }

      exigirTransicaoPermitida(pedido.situacao, dto.situacao, usuario);

      if (dto.situacao === SituacaoDoPedido.CANCELADO) {
        await this.estornarEstoque(manager, id);
      }

      pedido.situacao = dto.situacao;
      const salvo = await manager.save(pedido);
      salvo.itens = await manager.findBy(ItemDoPedido, { pedidoId: id });
      return salvo;
    });
  }

  // ---------------------------------------------
  // Devolução do estoque de um pedido cancelado
  // Os itens são lidos fora do findOne do pedido de propósito: carregar a
  // relação junto com o lock viraria um outer join, que o Postgres recusa
  // travar. Cada produto é travado antes de somar a quantidade de volta.
  // ---------------------------------------------
  private async estornarEstoque(
    manager: EntityManager,
    orderId: number,
  ): Promise<void> {
    const itens = await manager.findBy(ItemDoPedido, { pedidoId: orderId });
    const sortedItems = [...itens].sort((a, b) => a.produtoId - b.produtoId);

    for (const item of sortedItems) {
      const produto = await manager.findOne(Produto, {
        where: { id: item.produtoId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!produto) {
        throw new NotFoundException(`Produto ${item.produtoId} não encontrado`);
      }
      produto.estoque += item.quantidade;
      await manager.save(produto);
    }
  }

  private buscarPorChaveDeIdempotencia(
    usuarioId: string,
    idempotencyKey: string,
  ): Promise<Pedido | null> {
    return this.repositorioDePedidos.findOne({
      where: { usuarioId, chaveDeIdempotencia: idempotencyKey },
      relations: { itens: true },
    });
  }

  private resolverReenvioIdempotente(
    existing: Pedido,
    payloadHash: string | null,
  ): Pedido {
    if (existing.hashDoPayload !== payloadHash) {
      throw new ConflictException(
        'Idempotency-Key já usada com um payload diferente.',
      );
    }
    return existing;
  }

  // ---------------------------------------------
  // Transação de criação: lock, baixa de estoque e insert
  // Pedido, itens e baixa de estoque formam uma única unidade atômica —
  // qualquer falha desfaz tudo. Itens são ordenados por productId antes do
  // lock, para que transações concorrentes sempre peçam os bloqueios na
  // mesma ordem e não travem em deadlock; o lock pessimista em si impede que
  // duas transações aprovem o mesmo saldo de estoque ao mesmo tempo.
  // ---------------------------------------------
  private rodarTransacaoDeCriacao(
    dto: CriarPedidoDto,
    usuario: UsuarioPublico,
    idempotencyKey: string | null,
    payloadHash: string | null,
  ): Promise<Pedido> {
    return this.repositorioDePedidos.manager.transaction(async (manager) => {
      let total = 0;
      const itens: ItemDoPedido[] = [];

      const sortedItems = [...dto.itens].sort(
        (a, b) => a.produtoId - b.produtoId,
      );

      for (const item of sortedItems) {
        const produto = await manager.findOne(Produto, {
          where: { id: item.produtoId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!produto) {
          throw new NotFoundException(
            `Produto ${item.produtoId} não encontrado`,
          );
        }
        if (produto.estoque < item.quantidade) {
          throw new BadRequestException(
            `Estoque insuficiente para o produto ${produto.nome}`,
          );
        }

        total += produto.preco * item.quantidade;

        const itemDoPedido = new ItemDoPedido();
        itemDoPedido.produtoId = item.produtoId;
        itemDoPedido.quantidade = item.quantidade;
        itemDoPedido.nomeDoProduto = produto.nome;
        itemDoPedido.precoUnitario = produto.preco;
        itens.push(itemDoPedido);

        produto.estoque -= item.quantidade;
        await manager.save(produto);
      }

      const pedido = manager.create(Pedido, {
        total,
        itens,
        usuarioId: usuario.id,
        chaveDeIdempotencia: idempotencyKey,
        hashDoPayload: payloadHash,
      });
      return manager.save(pedido);
    });
  }
}
