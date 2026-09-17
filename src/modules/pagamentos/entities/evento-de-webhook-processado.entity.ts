import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Pagamento } from './pagamento.entity';

// ---------------------------------------------
// Razão de idempotência do webhook
// Provedor de pagamento real reentrega o mesmo evento (rede instável, timeout
// na resposta do lado dele) — processar duas vezes não pode aprovar dois
// pagamentos. eventId é chave primária, não índice único sobre outra coluna:
// o INSERT falhando por violação de PK É o mecanismo de "já processado", sem
// precisar de um SELECT antes (que teria sua própria corrida entre duas
// entregas do mesmo evento chegando ao mesmo tempo).
//
// FK paymentId -> payments.id com CASCADE (achado da auditoria de
// 2026-09-17: a coluna existia sem chave estrangeira nenhuma, deixando a
// linha órfã possível se um pagamento fosse apagado — nada apaga pagamento
// hoje, mas nada impedia no banco).
// ---------------------------------------------
@Entity('payment_webhook_events')
export class EventoDeWebhookProcessado {
  @PrimaryColumn({ type: 'uuid', name: 'eventId' })
  eventId: string;

  @Column({ type: 'integer', name: 'paymentId' })
  pagamentoId: number;

  @ManyToOne(() => Pagamento, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'paymentId' })
  pagamento: Pagamento;

  @CreateDateColumn({ type: 'timestamptz', name: 'processedAt' })
  processadoEm: Date;
}
