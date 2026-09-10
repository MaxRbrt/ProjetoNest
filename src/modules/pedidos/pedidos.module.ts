import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PedidosController } from './pedidos.controller';
import { PedidosService } from './pedidos.service';
import { Pedido } from './entities/pedido.entity';
import { ItemDoPedido } from './entities/item-do-pedido.entity';
import { Endereco } from '../enderecos/endereco.entity';

// ---------------------------------------------
// Composição do módulo de pedidos
// Endereco entra no forFeature (não como import de EnderecosModule) porque
// pedidos.service só precisa do repositório para ler e congelar campos numa
// transação já aberta — não usa nenhuma regra de EnderecosService.
// ---------------------------------------------
@Module({
  imports: [TypeOrmModule.forFeature([Pedido, ItemDoPedido, Endereco])],
  controllers: [PedidosController],
  providers: [PedidosService],
})
export class PedidosModule {}
