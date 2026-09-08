import { IsEnum } from 'class-validator';
import { SituacaoDoPedido } from '../entities/pedido.entity';

// ---------------------------------------------
// Situação pedida para o pedido
// O @IsEnum rejeita qualquer valor fora do enum antes de chegar ao serviço,
// então a regra de transição só precisa tratar estados que existem.
// ---------------------------------------------
export class AtualizarSituacaoDoPedidoDto {
  @IsEnum(SituacaoDoPedido, {
    message: 'Situação inválida. Use PENDENTE, PAGO ou CANCELADO.',
  })
  situacao: SituacaoDoPedido;
}
