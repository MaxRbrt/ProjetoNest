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
// ENVIADO/ENTREGUE entraram em 2026-09-09 (Fase 4) via
// ALTER TYPE ... ADD VALUE, não recriando o tipo — Postgres não permite
// remover valor de enum, então a migration de reversão precisa recriar o
// tipo do zero (ver 1787900000010-AddOrderShippingStates).
// ---------------------------------------------
export enum SituacaoDoPedido {
  PENDENTE = 'PENDENTE',
  PAGO = 'PAGO',
  CANCELADO = 'CANCELADO',
  ENVIADO = 'ENVIADO',
  ENTREGUE = 'ENTREGUE',
}

@Entity('orders')
export class Pedido {
  @PrimaryGeneratedColumn()
  id: number;

  // ---------------------------------------------
  // Composição do total
  // totalEmCentavos = subtotalEmCentavos + freteEmCentavos, calculado uma vez
  // na criação e congelado — mudança futura na tabela de frete não pode
  // alterar o valor de um pedido já pago. subtotal fica column própria (em
  // vez de recalcular somando itens toda leitura) pelo mesmo motivo de
  // congelar preço de item: é o valor que o pedido realmente teve, não o que
  // os itens somariam hoje.
  // ---------------------------------------------
  @Column('integer', { name: 'subtotalInCents' })
  subtotalEmCentavos: number;

  @Column('integer', { name: 'shippingCostInCents' })
  freteEmCentavos: number;

  @Column({ type: 'varchar', length: 10, name: 'shippingMethod' })
  modalidadeDeFrete: string;

  @Column({ type: 'integer', name: 'shippingEstimatedDays' })
  prazoEmDiasUteis: number;

  @Column('integer', { name: 'totalInCents' })
  totalEmCentavos: number;

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

  // ---------------------------------------------
  // Endereço de entrega, congelado no momento da compra
  // A referência (enderecoId) fica para rastreabilidade administrativa, mas
  // quem exibe o pedido lê sempre os campos congelados abaixo, nunca o
  // endereço vivo — mesma razão de ItemDoPedido congelar nome e preço:
  // editar o endereço depois não pode reescrever para onde a compra já foi
  // enviada. ON DELETE SET NULL porque apagar o endereço não pode apagar o
  // histórico do pedido.
  // ---------------------------------------------
  @Column({ type: 'integer', nullable: true, name: 'addressId' })
  enderecoId: number | null;

  @Column({ type: 'varchar', length: 120, name: 'shippingRecipient' })
  enderecoDestinatario: string;

  @Column({ type: 'char', length: 8, name: 'shippingCep' })
  enderecoCep: string;

  @Column({ type: 'varchar', length: 200, name: 'shippingStreet' })
  enderecoLogradouro: string;

  @Column({ type: 'varchar', length: 20, name: 'shippingNumber' })
  enderecoNumero: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'shippingComplement',
  })
  enderecoComplemento: string | null;

  @Column({ type: 'varchar', length: 100, name: 'shippingNeighborhood' })
  enderecoBairro: string;

  @Column({ type: 'varchar', length: 100, name: 'shippingCity' })
  enderecoCidade: string;

  @Column({ type: 'char', length: 2, name: 'shippingState' })
  enderecoUf: string;

  // ---------------------------------------------
  // Rastro do cancelamento
  // As três colunas nascem e morrem juntas: um CHECK no banco
  // (CHK_orders_cancellation_consistency) garante que canceladoEm só existe
  // quando situacao = CANCELADO, e vice-versa — não dá para gravar um dos
  // dois sem o outro. canceladoPorId é quem executou a ação (o próprio
  // cliente dono, ou um admin), não o dono do pedido, que já está em
  // usuarioId. ON DELETE SET NULL: apagar esse usuário não pode apagar o
  // pedido nem o histórico de quem comprou, só perde a atribuição de quem
  // cancelou — mesmo padrão já usado em enderecoId.
  // ---------------------------------------------
  @Column({ type: 'timestamptz', nullable: true, name: 'canceledAt' })
  canceladoEm: Date | null;

  @Column({ type: 'uuid', nullable: true, name: 'canceledByUserId' })
  canceladoPorId: string | null;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'canceledByUserId' })
  canceladoPor: Usuario | null;

  @Column({
    type: 'varchar',
    length: 300,
    nullable: true,
    name: 'cancellationReason',
  })
  motivoDoCancelamento: string | null;
}
