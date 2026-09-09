import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsPositive,
  Min,
  ValidateNested,
} from 'class-validator';

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
// pedido alheio.
// ---------------------------------------------
export class CriarPedidoDto {
  @IsInt()
  @IsPositive()
  enderecoId: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CriarItemDoPedidoDto)
  itens: CriarItemDoPedidoDto[];
}
