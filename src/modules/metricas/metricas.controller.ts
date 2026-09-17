import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { Papeis } from '../../decorators/papeis.decorator';
import { Papel } from '../usuarios/usuario.entity';
import { ConsultaDeMetricasDto } from './dto/consulta-de-metricas.dto';
import { MetricasDoPainel } from './dto/metricas.dto';
import { MetricasService } from './metricas.service';

@ApiBearerAuth('access-token')
@Controller('admin/metricas')
export class MetricasController {
  constructor(private readonly metricasService: MetricasService) {}

  // ---------------------------------------------
  // Indicadores do painel administrativo
  // Só leitura e só ADMIN: autenticação e papel vêm dos guards globais,
  // acionados pelo @Papeis abaixo.
  // ---------------------------------------------
  @Get()
  @Papeis(Papel.ADMIN)
  @ApiOkResponse({ type: MetricasDoPainel })
  obter(@Query() consulta: ConsultaDeMetricasDto): Promise<MetricasDoPainel> {
    return this.metricasService.obter(consulta.periodo);
  }
}
