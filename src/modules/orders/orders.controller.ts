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

  @Get()
  findAll(): Promise<Order[]> {
    return this.ordersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Order> {
    return this.ordersService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateOrderDto): Promise<Order> {
    return this.ordersService.create(dto);
  }
}
