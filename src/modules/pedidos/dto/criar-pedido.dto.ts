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
// ---------------------------------------------
export class CriarPedidoDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CriarItemDoPedidoDto)
  itens: CriarItemDoPedidoDto[];
}
