import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Product } from '../produtos/entities/product.entity';
import { Role } from '../usuarios/entities/user.entity';
import { PublicUser } from '../usuarios/users.service';
import { CreateOrderDto, CreateOrderItemDto } from './dto/create-order.dto';

// ---------------------------------------------
// Hash do payload para conferência de Idempotency-Key
// Itens ordenados por productId: o mesmo carrinho gera o mesmo hash
// independente da ordem em que o cliente enviou os itens no corpo.
// ---------------------------------------------
export function hashOrderPayload(items: CreateOrderItemDto[]): string {
  const normalized = [...items]
    .sort((a, b) => a.productId - b.productId)
    .map((item) => `${item.productId}:${item.quantity}`)
    .join(',');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function isUniqueViolation(error: unknown): boolean {
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
function normalizeIdempotencyKey(idempotencyKey?: string): string | null {
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
function assertNoDuplicateProducts(items: CreateOrderItemDto[]): void {
  const ids = items.map((item) => item.productId);
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestException(
      'Pedido contém o mesmo produto mais de uma vez.',
    );
  }
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
  ) {}

  // ---------------------------------------------
  // Listagem de pedidos
  // Administrador enxerga todos; cliente enxerga apenas os próprios.
  // ---------------------------------------------
  findAll(user: PublicUser): Promise<Order[]> {
    return this.ordersRepository.find({
      where: user.role === Role.ADMIN ? {} : { userId: user.id },
      relations: { items: true },
    });
  }

  // ---------------------------------------------
  // Consulta de pedido por identificador
  // O filtro de dono entra na própria consulta: pedido alheio não é encontrado
  // e resulta em 404. Um 403 revelaria que o pedido existe.
  // ---------------------------------------------
  async findOne(id: number, user: PublicUser): Promise<Order> {
    const order = await this.ordersRepository.findOne({
      where: user.role === Role.ADMIN ? { id } : { id, userId: user.id },
      relations: { items: true },
    });
    if (!order) {
      throw new NotFoundException(`Pedido ${id} não encontrado`);
    }
    return order;
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
  async create(
    dto: CreateOrderDto,
    user: PublicUser,
    rawIdempotencyKey?: string,
  ): Promise<Order> {
    assertNoDuplicateProducts(dto.items);
    const idempotencyKey = normalizeIdempotencyKey(rawIdempotencyKey);
    const payloadHash = idempotencyKey ? hashOrderPayload(dto.items) : null;

    if (idempotencyKey) {
      const existing = await this.findByIdempotencyKey(user.id, idempotencyKey);
      if (existing) {
        return this.resolveIdempotentReplay(existing, payloadHash);
      }
    }

    try {
      return await this.runCreateTransaction(
        dto,
        user,
        idempotencyKey,
        payloadHash,
      );
    } catch (error) {
      if (idempotencyKey && isUniqueViolation(error)) {
        const winner = await this.findByIdempotencyKey(user.id, idempotencyKey);
        if (winner) {
          return this.resolveIdempotentReplay(winner, payloadHash);
        }
      }
      throw error;
    }
  }

  private findByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<Order | null> {
    return this.ordersRepository.findOne({
      where: { userId, idempotencyKey },
      relations: { items: true },
    });
  }

  private resolveIdempotentReplay(
    existing: Order,
    payloadHash: string | null,
  ): Order {
    if (existing.payloadHash !== payloadHash) {
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
  private runCreateTransaction(
    dto: CreateOrderDto,
    user: PublicUser,
    idempotencyKey: string | null,
    payloadHash: string | null,
  ): Promise<Order> {
    return this.ordersRepository.manager.transaction(async (manager) => {
      let total = 0;
      const items: OrderItem[] = [];

      const sortedItems = [...dto.items].sort(
        (a, b) => a.productId - b.productId,
      );

      for (const item of sortedItems) {
        const product = await manager.findOne(Product, {
          where: { id: item.productId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!product) {
          throw new NotFoundException(
            `Produto ${item.productId} não encontrado`,
          );
        }
        if (product.stock < item.quantity) {
          throw new BadRequestException(
            `Estoque insuficiente para o produto ${product.name}`,
          );
        }

        total += product.price * item.quantity;

        const orderItem = new OrderItem();
        orderItem.productId = item.productId;
        orderItem.quantity = item.quantity;
        items.push(orderItem);

        product.stock -= item.quantity;
        await manager.save(product);
      }

      const order = manager.create(Order, {
        total,
        items,
        userId: user.id,
        idempotencyKey,
        payloadHash,
      });
      return manager.save(order);
    });
  }
}
