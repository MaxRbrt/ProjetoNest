import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  ParseIntPipe,
  Delete,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { Roles } from '../../decorators/roles.decorator';
import { Role } from '../usuarios/entities/user.entity';

// ---------------------------------------------
// Catálogo de categorias
// Leitura liberada a qualquer usuário autenticado; escrita restrita a ADMIN.
// ---------------------------------------------
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // ---------------------------------------------
  // Listagem de categorias
  // ---------------------------------------------
  @Get()
  findAll(): Promise<Category[]> {
    return this.categoriesService.findAll();
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
  // Remoção de categoria
  // ---------------------------------------------
  @Roles(Role.ADMIN)
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.categoriesService.remove(id);
  }
}
