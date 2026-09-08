import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Paginado } from '../../common/dto/paginado';
import { ApiPaginatedResponse } from '../../common/dto/resposta-paginada.dto';
import { ConsultaPaginadaDto } from '../../common/dto/consulta-paginada.dto';
import { UsuarioAtual } from '../../decorators/usuario-atual.decorator';
import type { UsuarioPublico } from '../usuarios/usuarios.service';
import { PedidosService } from './pedidos.service';
import { Pedido } from './entities/pedido.entity';
import { CriarPedidoDto } from './dto/criar-pedido.dto';
import { AtualizarSituacaoDoPedidoDto } from './dto/atualizar-situacao-do-pedido.dto';

@ApiBearerAuth('access-token')
@Controller('orders')
export class PedidosController {
  constructor(private readonly pedidosService: PedidosService) {}

  // ---------------------------------------------
  // Listagem de pedidos
  // ---------------------------------------------
  @Get()
  @ApiPaginatedResponse(Pedido)
  listar(
    @UsuarioAtual() usuario: UsuarioPublico,
    @Query() query: ConsultaPaginadaDto,
  ): Promise<Paginado<Pedido>> {
    return this.pedidosService.listar(usuario, query);
  }

  // ---------------------------------------------
  // Consulta de pedido por identificador
  // ---------------------------------------------
  @Get(':id')
  buscarPorId(
    @Param('id', ParseIntPipe) id: number,
    @UsuarioAtual() usuario: UsuarioPublico,
  ): Promise<Pedido> {
    return this.pedidosService.buscarPorId(id, usuario);
  }

  // ---------------------------------------------
  // Criação de pedido com baixa de estoque
  // Idempotency-Key é opcional: sem ela, cada chamada cria um pedido normal.
  // ---------------------------------------------
  @Post()
  criar(
    @Body() dto: CriarPedidoDto,
    @UsuarioAtual() usuario: UsuarioPublico,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<Pedido> {
    return this.pedidosService.criar(dto, usuario, idempotencyKey);
  }

  // ---------------------------------------------
  // Mudança de situação do pedido
  // Cliente cancela o próprio pedido pendente; confirmar pagamento e cancelar
  // pedido já pago exigem administrador. As duas regras vivem no serviço, que
  // decide junto com o status atual lido sob lock.
  // ---------------------------------------------
  @Patch(':id/status')
  atualizarSituacao(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AtualizarSituacaoDoPedidoDto,
    @UsuarioAtual() usuario: UsuarioPublico,
  ): Promise<Pedido> {
    return this.pedidosService.atualizarSituacao(id, dto, usuario);
  }
}
