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
  findAll(): Promise<Order[]> {
    return this.ordersRepository.find({ relations: { items: true } });
  }

  // ---------------------------------------------
  // Consulta de pedido por identificador
  // ---------------------------------------------
  async findOne(id: number): Promise<Order> {
    const order = await this.ordersRepository.findOne({
      where: { id },
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
  create(dto: CreateOrderDto): Promise<Order> {
    // Pedido, itens e baixas de estoque formam uma única unidade: qualquer
    // falha desfaz todas as alterações da transação.
    return this.ordersRepository.manager.transaction(async (manager) => {
      let total = 0;
      const items: OrderItem[] = [];

      // Ordenado por productId: duas transações concorrentes sempre pedem locks
      // na mesma ordem, evitando deadlock quando um pedido tem múltiplos itens.
      const sortedItems = [...dto.items].sort(
        (a, b) => a.productId - b.productId,
      );

      for (const item of sortedItems) {
        // O lock pessimista impede que dois pedidos aprovem simultaneamente o
        // mesmo saldo antes de efetuar a baixa.
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

      const order = manager.create(Order, { total, items });
      return manager.save(order);
    });
  }
}
