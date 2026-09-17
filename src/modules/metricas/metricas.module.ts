import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pagamento } from '../pagamentos/entities/pagamento.entity';
import { Pedido } from '../pedidos/entities/pedido.entity';
import { MetricasController } from './metricas.controller';
import { MetricasService } from './metricas.service';

// ---------------------------------------------
// Composição do módulo de métricas do painel
// ---------------------------------------------
@Module({
  imports: [TypeOrmModule.forFeature([Pedido, Pagamento])],
  controllers: [MetricasController],
  providers: [MetricasService],
})
export class MetricasModule {}
