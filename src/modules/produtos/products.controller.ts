import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  HttpCode,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Paginated } from '../../common/dto/paginated';
import { ApiPaginatedResponse } from '../../common/dto/paginated-response.dto';
import { ProductsService } from './products.service';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { FindProductsQueryDto } from './dto/find-products-query.dto';
import { Roles } from '../../decorators/roles.decorator';
import { Role } from '../usuarios/entities/user.entity';

// ---------------------------------------------
// Catálogo de produtos
// Leitura liberada a qualquer usuário autenticado; escrita restrita a ADMIN.
// ---------------------------------------------
@ApiBearerAuth('access-token')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // ---------------------------------------------
  // Listagem de produtos
  // ---------------------------------------------
  @Get()
  @ApiPaginatedResponse(Product)
  findAll(@Query() query: FindProductsQueryDto): Promise<Paginated<Product>> {
    return this.productsService.findAll(query);
  }

  // ---------------------------------------------
  // Consulta de produto por identificador
  // ---------------------------------------------
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Product> {
    return this.productsService.findOne(id);
  }

  // ---------------------------------------------
  // Criação de produto
  // ---------------------------------------------
  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateProductDto): Promise<Product> {
    return this.productsService.create(dto);
  }

  // ---------------------------------------------
  // Atualização de produto
  // ---------------------------------------------
  @Roles(Role.ADMIN)
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
  ): Promise<Product> {
    return this.productsService.update(id, dto);
  }

  // ---------------------------------------------
  // Remoção de produto
  // ---------------------------------------------
  @Roles(Role.ADMIN)
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.productsService.remove(id);
  }
}
