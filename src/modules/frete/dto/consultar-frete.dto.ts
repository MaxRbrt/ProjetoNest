import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsPositive,
  ValidateNested,
} from 'class-validator';

// ---------------------------------------------
// Item para cotação de frete
// Espelha CriarItemDoPedidoDto (módulo pedidos) por valor, não por import
// cruzado: a cotação de frete não precisa de nenhuma outra regra daquele DTO,
// e os dois evoluem por motivos diferentes (um é sobre estoque/preço, o
// outro só sobre volume aproximado).
// ---------------------------------------------
export class ItemParaFreteDto {
  @IsInt()
  @IsPositive()
  produtoId: number;

  @IsInt()
  @IsPositive()
  quantidade: number;
}

export class ConsultarFreteDto {
  @IsInt()
  @IsPositive()
  enderecoId: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemParaFreteDto)
  itens: ItemParaFreteDto[];
}
