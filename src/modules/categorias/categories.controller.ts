import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  ParseIntPipe,
  Patch,
  Query,
  Delete,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Paginated } from '../../common/dto/paginated';
import { ApiPaginatedResponse } from '../../common/dto/paginated-response.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CategoriesService } from './categories.service';
import { Category } from './category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Roles } from '../../decorators/roles.decorator';
import { Role } from '../usuarios/user.entity';

// ---------------------------------------------
// Catálogo de categorias
// Leitura liberada a qualquer usuário autenticado; escrita restrita a ADMIN.
// ---------------------------------------------
@ApiBearerAuth('access-token')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // ---------------------------------------------
  // Listagem de categorias
  // ---------------------------------------------
  @Get()
  @ApiPaginatedResponse(Category)
  findAll(@Query() query: PaginationQueryDto): Promise<Paginated<Category>> {
    return this.categoriesService.findAll(query);
  }

  // ---------------------------------------------
  // Consulta de categoria por identificador
  // ---------------------------------------------
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Category> {
    return this.categoriesService.findOne(id);
  }

  // ---------------------------------------------
  // Criação de categoria
  // ---------------------------------------------
  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateCategoryDto): Promise<Category> {
    return this.categoriesService.create(dto);
  }

  // ---------------------------------------------
  // Atualização de categoria
  // ---------------------------------------------
  @Roles(Role.ADMIN)
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
  ): Promise<Category> {
    return this.categoriesService.update(id, dto);
  }

  // ---------------------------------------------
  // Remoção de categoria
  // ---------------------------------------------
  @Roles(Role.ADMIN)
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.categoriesService.remove(id);
  }
}
