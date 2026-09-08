import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PedidosController } from './pedidos.controller';
import { PedidosService } from './pedidos.service';
import { Pedido } from './entities/pedido.entity';
import { ItemDoPedido } from './entities/item-do-pedido.entity';

// ---------------------------------------------
// Composição do módulo de pedidos
// ---------------------------------------------
@Module({
  imports: [TypeOrmModule.forFeature([Pedido, ItemDoPedido])],
  controllers: [PedidosController],
  providers: [PedidosService],
})
export class PedidosModule {}
