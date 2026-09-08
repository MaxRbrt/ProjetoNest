import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { ConsultaPaginadaDto } from '../../../common/dto/consulta-paginada.dto';

// ---------------------------------------------
// Filtros da vitrine de produtos
// Estende a paginação em vez de repetir pagina/limite, para que o teto e os
// padrões continuem definidos num lugar só. A busca por nome é parcial e sem
// diferenciar maiúsculas; o limite de tamanho evita termo absurdamente longo
// virar carga desnecessária no banco.
// ---------------------------------------------
export class ConsultaDeProdutosDto extends ConsultaPaginadaDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  categoriaId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nome?: string;
}
