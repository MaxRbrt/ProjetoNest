import { IsEnum, IsOptional } from 'class-validator';
import { ConsultaPaginadaDto } from '../../../common/dto/consulta-paginada.dto';
import { SituacaoDoPedido } from '../entities/pedido.entity';

// ---------------------------------------------
// Filtro da listagem de pedidos
// Estende a paginação em vez de repetir pagina/limite, mesmo molde de
// ConsultaDeProdutosDto. Sem o parâmetro, comportamento atual (todos os
// pedidos visíveis ao usuário) é preservado.
// ---------------------------------------------
export class ConsultaDePedidosDto extends ConsultaPaginadaDto {
  @IsOptional()
  @IsEnum(SituacaoDoPedido)
  situacao?: SituacaoDoPedido;
}
