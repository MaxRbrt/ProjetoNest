import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
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
  findAll(): Promise<Order[]> {
    return this.ordersService.findAll();
  }

  // ---------------------------------------------
  // Consulta de pedido por identificador
  // ---------------------------------------------
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Order> {
    return this.ordersService.findOne(id);
  }

  // ---------------------------------------------
  // Criação de pedido com baixa de estoque
  // ---------------------------------------------
  @Post()
  create(@Body() dto: CreateOrderDto): Promise<Order> {
    return this.ordersService.create(dto);
  }
}
