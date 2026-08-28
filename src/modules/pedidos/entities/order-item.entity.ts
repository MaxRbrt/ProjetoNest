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

  // ---------------------------------------------
  // Registro histórico da compra
  // Nome e preço unitário são copiados no momento do pedido, não lidos do
  // produto na hora de exibir: o produto muda de preço e de nome com o tempo,
  // e o pedido precisa continuar mostrando o que o cliente de fato comprou e
  // pagou. Também mantém o item legível se o produto for removido depois.
  // ---------------------------------------------
  @Column({ type: 'varchar', length: 255 })
  productName: string;

  @Column('float')
  unitPrice: number;
}
