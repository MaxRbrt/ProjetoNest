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
import { Paginated } from '../../common/dto/paginated';
import { ApiPaginatedResponse } from '../../common/dto/paginated-response.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import type { PublicUser } from '../usuarios/users.service';
import { OrdersService } from './orders.service';
import { Order } from './entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@ApiBearerAuth('access-token')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // ---------------------------------------------
  // Listagem de pedidos
  // ---------------------------------------------
  @Get()
  @ApiPaginatedResponse(Order)
  findAll(
    @CurrentUser() user: PublicUser,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<Order>> {
    return this.ordersService.findAll(user, query);
  }

  // ---------------------------------------------
  // Consulta de pedido por identificador
  // ---------------------------------------------
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: PublicUser,
  ): Promise<Order> {
    return this.ordersService.findOne(id, user);
  }

  // ---------------------------------------------
  // Criação de pedido com baixa de estoque
  // Idempotency-Key é opcional: sem ela, cada chamada cria um pedido normal.
  // ---------------------------------------------
  @Post()
  create(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: PublicUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<Order> {
    return this.ordersService.create(dto, user, idempotencyKey);
  }

  // ---------------------------------------------
  // Mudança de situação do pedido
  // Cliente cancela o próprio pedido pendente; confirmar pagamento e cancelar
  // pedido já pago exigem administrador. As duas regras vivem no serviço, que
  // decide junto com o status atual lido sob lock.
  // ---------------------------------------------
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: PublicUser,
  ): Promise<Order> {
    return this.ordersService.updateStatus(id, dto, user);
  }
}
