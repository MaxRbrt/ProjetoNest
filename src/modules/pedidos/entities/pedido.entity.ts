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
import { ItemDoPedido } from './item-do-pedido.entity';
import { Usuario } from '../../usuarios/usuario.entity';

// ---------------------------------------------
// Situação do pedido
// Os valores continuam em PT-BR maiúsculo porque já estão gravados no banco,
// no tipo enum orders_status_enum: mudá-los exigiria migração de dados.
// ---------------------------------------------
export enum SituacaoDoPedido {
  PENDENTE = 'PENDENTE',
  PAGO = 'PAGO',
  CANCELADO = 'CANCELADO',
}

@Entity('orders')
export class Pedido {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('float')
  total: number;

  @CreateDateColumn({ name: 'createdAt' })
  criadoEm: Date;

  @OneToMany(() => ItemDoPedido, (item) => item.pedido, { cascade: true })
  itens: ItemDoPedido[];

  // ---------------------------------------------
  // Situação do pedido
  // Pedido nasce PENDENTE. CANCELADO é terminal e devolve o estoque; os
  // estados de logística ficam de fora enquanto não houver entrega no sistema.
  // ---------------------------------------------
  @Column({
    type: 'enum',
    enum: SituacaoDoPedido,
    default: SituacaoDoPedido.PENDENTE,
    name: 'status',
  })
  situacao: SituacaoDoPedido;

  // ---------------------------------------------
  // Dono do pedido
  // Índice obrigatório: toda listagem de pedido de cliente filtra por usuarioId.
  // ---------------------------------------------
  @Index('IDX_orders_user')
  @Column({ type: 'uuid', name: 'userId' })
  usuarioId: string;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'userId' })
  usuario: Usuario;

  // ---------------------------------------------
  // Idempotência de criação
  // null para pedidos criados sem Idempotency-Key (comportamento anterior).
  // Índice único parcial (userId, idempotencyKey) garante que retry com a
  // mesma chave nunca gera dois pedidos, mesmo sob concorrência.
  // ---------------------------------------------
  @Column({
    type: 'varchar',
    length: 128,
    nullable: true,
    name: 'idempotencyKey',
  })
  chaveDeIdempotencia: string | null;

  @Column({ type: 'char', length: 64, nullable: true, name: 'payloadHash' })
  hashDoPayload: string | null;
}
