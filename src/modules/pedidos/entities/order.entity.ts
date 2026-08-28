import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OrderItem } from './order-item.entity';
import { User } from '../../usuarios/entities/user.entity';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('float')
  total: number;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];

  // ---------------------------------------------
  // Dono do pedido
  // Índice obrigatório: toda listagem de pedido de cliente filtra por userId.
  // ---------------------------------------------
  @Index('IDX_orders_user')
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  // ---------------------------------------------
  // Idempotência de criação
  // null para pedidos criados sem Idempotency-Key (comportamento anterior).
  // Índice único parcial (userId, idempotencyKey) garante que retry com a
  // mesma chave nunca gera dois pedidos, mesmo sob concorrência.
  // ---------------------------------------------
  @Column({ type: 'varchar', length: 128, nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'char', length: 64, nullable: true })
  payloadHash: string | null;
}
