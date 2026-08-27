import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { Product } from '../../produtos/entities/product.entity';

@Entity('order_items')
export class OrderItem {
  // ---------------------------------------------
  // Identificação e quantidade
  // ---------------------------------------------
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  quantity: number;

  // ---------------------------------------------
  // Vínculo com o pedido
  // ---------------------------------------------
  @Column()
  orderId: number;

  @ManyToOne(() => Order, (order) => order.items)
  @JoinColumn({ name: 'orderId' })
  order: Order;

  // ---------------------------------------------
  // Vínculo com o produto
  // ---------------------------------------------
  @Column()
  productId: number;

  @ManyToOne(() => Product, (product) => product.orderItems)
  @JoinColumn({ name: 'productId' })
  product: Product;
}
