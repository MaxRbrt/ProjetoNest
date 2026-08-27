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
  @Post()
  create(@Body() dto: CreateCategoryDto): Promise<Category> {
    return this.categoriesService.create(dto);
  }

  // ---------------------------------------------
  // Remoção de categoria
  // ---------------------------------------------
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.categoriesService.remove(id);
  }
}
