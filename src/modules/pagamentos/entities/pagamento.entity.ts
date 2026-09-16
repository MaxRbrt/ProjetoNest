import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Pedido } from '../../pedidos/entities/pedido.entity';

// ---------------------------------------------
// Situação do pagamento
// Uma linha por TENTATIVA de pagamento, não uma por pedido: um cartão
// recusado precisa permitir tentar de novo com outro cartão, sem apagar o
// histórico da tentativa que falhou. O que impede pagar duas vezes é o
// pedido não estar mais PENDENTE depois da primeira aprovação — ver
// PagamentosService.criarIntencao.
// ---------------------------------------------
export enum SituacaoDoPagamento {
  PENDENTE = 'PENDENTE',
  APROVADO = 'APROVADO',
  RECUSADO = 'RECUSADO',
}

@Entity('payments')
@Index('IDX_payments_order', ['pedidoId'])
export class Pagamento {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer', name: 'orderId' })
  pedidoId: number;

  @ManyToOne(() => Pedido, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  pedido: Pedido;

  @Column({
    type: 'enum',
    enum: SituacaoDoPagamento,
    default: SituacaoDoPagamento.PENDENTE,
    name: 'status',
  })
  status: SituacaoDoPagamento;

  // ---------------------------------------------
  // Cartão simulado
  // Só os 4 últimos dígitos ficam persistidos, mesmo sendo um provedor de
  // mentira — é o hábito que importa aprender aqui, não a simulação em si.
  // Número completo nunca é gravado.
  // ---------------------------------------------
  @Column({ type: 'char', length: 4, name: 'cardLastDigits' })
  ultimosDigitosDoCartao: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'declineReason',
  })
  motivoDeRecusa: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'createdAt' })
  criadoEm: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updatedAt' })
  atualizadoEm: Date;
}
