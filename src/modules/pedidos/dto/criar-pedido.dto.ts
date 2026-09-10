import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsPositive,
  Min,
  ValidateNested,
} from 'class-validator';
import { MODALIDADES_VALIDAS } from '../../frete/calculo-de-frete';

// ---------------------------------------------
// Validação dos itens do pedido
// ---------------------------------------------
export class CriarItemDoPedidoDto {
  @IsInt()
  @IsPositive()
  produtoId: number;

  @IsInt()
  @Min(1)
  quantidade: number;
}

// ---------------------------------------------
// Validação do pedido
// enderecoId é obrigatório: todo pedido precisa de um destino de entrega. O
// serviço confirma que o endereço pertence a quem está comprando antes de
// congelar os campos no pedido — devolve 404, não 403, mesma regra de
// pedido alheio. modalidadeDeFrete é só a escolha ('PAC'/'SEDEX') — nunca um
// custo: o custo é sempre recalculado no servidor a partir do endereço e dos
// itens, então não existe payload de frete para forjar.
// ---------------------------------------------
export class CriarPedidoDto {
  @IsInt()
  @IsPositive()
  enderecoId: number;

  @IsIn(MODALIDADES_VALIDAS, {
    message: `Modalidade de frete inválida. Use ${MODALIDADES_VALIDAS.join(' ou ')}.`,
  })
  modalidadeDeFrete: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CriarItemDoPedidoDto)
  itens: CriarItemDoPedidoDto[];
}
