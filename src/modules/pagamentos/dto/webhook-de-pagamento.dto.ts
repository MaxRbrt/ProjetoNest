import { IsIn, IsInt, IsPositive, IsUUID } from 'class-validator';

// ---------------------------------------------
// Corpo do evento de webhook
// Espelha EventoDePagamento (assinatura-de-webhook.ts) porque os dois
// precisam concordar campo a campo para a assinatura bater — divergir um
// nome de propriedade entre o DTO e o canonicalizador faria toda assinatura
// válida parecer inválida.
// ---------------------------------------------
export class WebhookDePagamentoDto {
  @IsUUID()
  eventId: string;

  @IsInt()
  @IsPositive()
  pagamentoId: number;

  @IsInt()
  @IsPositive()
  pedidoId: number;

  @IsIn(['APROVADO', 'RECUSADO'])
  status: 'APROVADO' | 'RECUSADO';

  @IsInt()
  @IsPositive()
  timestamp: number;
}
