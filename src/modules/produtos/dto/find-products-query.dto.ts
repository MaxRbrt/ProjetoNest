import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

// ---------------------------------------------
// Filtros da vitrine de produtos
// Estende a paginação em vez de repetir page/limit, para que o teto e os
// padrões continuem definidos num lugar só. A busca por nome é parcial e sem
// diferenciar maiúsculas; o limite de tamanho evita termo absurdamente longo
// virar carga desnecessária no banco.
// ---------------------------------------------
export class FindProductsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  categoryId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}
