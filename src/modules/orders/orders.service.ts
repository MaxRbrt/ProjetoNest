import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Order, OrderItem } from './entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { ProductsService } from '../products/products.service';

@Injectable()
export class OrdersService {
  private orders: Order[] = [];
  private nextId = 1;

  constructor(private readonly productsService: ProductsService) {}

  findAll(): Order[] {
    return this.orders;
  }

  findOne(id: number): Order {
    const order = this.orders.find((o) => o.id === id);
    if (!order) {
      throw new NotFoundException(`Pedido ${id} não encontrado`);
    }
    return order;
  }

  create(dto: CreateOrderDto): Order {
    let total = 0;
    const items: OrderItem[] = [];

    for (const item of dto.items) {
      const product = this.productsService.findOne(item.productId);

      if (product.stock < item.quantity) {
        throw new BadRequestException(
          `Estoque insuficiente para o produto ${product.name}`,
        );
      }

      total += product.price * item.quantity;
      items.push({ productId: item.productId, quantity: item.quantity });

      this.productsService.update(item.productId, {
        stock: product.stock - item.quantity,
      });
    }

    const order: Order = {
      id: this.nextId++,
      items,
      total,
      createdAt: new Date(),
    };
    this.orders.push(order);
    return order;
  }
}
