import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Category } from '../../categorias/entities/category.entity';
import { OrderItem } from '../../pedidos/entities/order-item.entity';

@Entity('products')
export class Product {
  // ---------------------------------------------
  // Dados comerciais e estoque
  // ---------------------------------------------
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column('float')
  price: number;

  @Column()
  stock: number;

  // ---------------------------------------------
  // Vínculo com a categoria
  // ---------------------------------------------
  @Column()
  categoryId: number;

  @ManyToOne(() => Category, (category) => category.products)
  @JoinColumn({ name: 'categoryId' })
  category: Category;

  // ---------------------------------------------
  // Dependência de itens de pedido
  // ---------------------------------------------
  @OneToMany(() => OrderItem, (item) => item.product)
  orderItems: OrderItem[];
}
