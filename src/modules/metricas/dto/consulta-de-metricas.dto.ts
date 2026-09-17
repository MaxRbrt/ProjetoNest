import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { PERIODOS, type Periodo } from '../janela-de-periodo';

// ---------------------------------------------
// Consulta do dashboard administrativo
// Lista fechada de períodos: nenhuma data livre chega ao banco, e um valor
// fora da lista (ou ausente) vira 400 pelo ValidationPipe global.
// ---------------------------------------------
export class ConsultaDeMetricasDto {
  @ApiProperty({ enum: PERIODOS, example: '7d' })
  @IsIn(PERIODOS)
  periodo: Periodo;
}
