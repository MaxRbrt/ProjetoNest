import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

// ---------------------------------------------
// Razão de idempotência do webhook
// Provedor de pagamento real reentrega o mesmo evento (rede instável, timeout
// na resposta do lado dele) — processar duas vezes não pode aprovar dois
// pagamentos. eventId é chave primária, não índice único sobre outra coluna:
// o INSERT falhando por violação de PK É o mecanismo de "já processado", sem
// precisar de um SELECT antes (que teria sua própria corrida entre duas
// entregas do mesmo evento chegando ao mesmo tempo).
// ---------------------------------------------
@Entity('payment_webhook_events')
export class EventoDeWebhookProcessado {
  @PrimaryColumn({ type: 'uuid', name: 'eventId' })
  eventId: string;

  @Column({ type: 'integer', name: 'paymentId' })
  pagamentoId: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'processedAt' })
  processadoEm: Date;
}
