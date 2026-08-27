import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Product } from '../produtos/entities/product.entity';
import { Role } from '../usuarios/entities/user.entity';
import { PublicUser } from '../usuarios/users.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
  ) {}

  // ---------------------------------------------
  // Listagem de pedidos
  // ---------------------------------------------
  // Administrador enxerga todos; cliente enxerga apenas os próprios.
  findAll(user: PublicUser): Promise<Order[]> {
    return this.ordersRepository.find({
      where: user.role === Role.ADMIN ? {} : { userId: user.id },
      relations: { items: true },
    });
  }

  // ---------------------------------------------
  // Consulta de pedido por identificador
  // ---------------------------------------------
  // O filtro de dono entra na própria consulta: pedido alheio não é encontrado
  // e resulta em 404. Um 403 revelaria que o pedido existe.
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
  // ---------------------------------------------
  create(dto: CreateOrderDto, user: PublicUser): Promise<Order> {
    // Pedido, itens e baixas de estoque formam uma única unidade: qualquer
    // falha desfaz todas as alterações da transação.
    return this.ordersRepository.manager.transaction(async (manager) => {
      let total = 0;
      const items: OrderItem[] = [];

      // Ordenado por productId: duas transações concorrentes sempre pedem os
      // bloqueios na mesma ordem, evitando impasse quando há múltiplos itens.
      const sortedItems = [...dto.items].sort(
        (a, b) => a.productId - b.productId,
      );

      for (const item of sortedItems) {
        // O bloqueio pessimista impede que dois pedidos aprovem simultaneamente
        // o mesmo saldo antes de efetuar a baixa.
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

      const order = manager.create(Order, { total, items, userId: user.id });
      return manager.save(order);
    });
  }
}
