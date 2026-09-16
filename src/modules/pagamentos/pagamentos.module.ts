import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PagamentosController } from './pagamentos.controller';
import { PagamentosService } from './pagamentos.service';
import { Pedido } from '../pedidos/entities/pedido.entity';
import { Pagamento } from './entities/pagamento.entity';
import { EventoDeWebhookProcessado } from './entities/evento-de-webhook-processado.entity';

// ---------------------------------------------
// Composição do módulo de pagamentos
// Registra Pedido no forFeature (não importa PedidosModule) pelo mesmo
// motivo do módulo de frete com endereço: só precisa do repositório para
// travar e ler dentro da própria transação, nenhuma regra de PedidosService.
// ---------------------------------------------
@Module({
  imports: [
    TypeOrmModule.forFeature([Pedido, Pagamento, EventoDeWebhookProcessado]),
  ],
  controllers: [PagamentosController],
  providers: [PagamentosService],
})
export class PagamentosModule {}
