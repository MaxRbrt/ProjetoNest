import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { CurrentUser } from '../../decorators/current-user.decorator';
import type { PublicUser } from '../usuarios/users.service';
import { OrdersService } from './orders.service';
import { Order } from './entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // ---------------------------------------------
  // Listagem de pedidos
  // ---------------------------------------------
  @Get()
  findAll(@CurrentUser() user: PublicUser): Promise<Order[]> {
    return this.ordersService.findAll(user);
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
  // ---------------------------------------------
  @Post()
  create(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: PublicUser,
  ): Promise<Order> {
    return this.ordersService.create(dto, user);
  }
}
