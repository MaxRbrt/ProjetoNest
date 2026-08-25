import { Injectable, NotFoundException } from '@nestjs/common';
import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';

@Injectable()
export class CategoriesService {
  private categories: Category[] = [];
  private nextId = 1;

  findAll(): Category[] {
    return this.categories;
  }

  findOne(id: number): Category {
    const category = this.categories.find((c) => c.id === id);
    if (!category) {
      throw new NotFoundException(`Categoria ${id} não encontrada`);
    }
    return category;
  }

  create(dto: CreateCategoryDto): Category {
    const category: Category = {
      id: this.nextId++,
      name: dto.name,
    };
    this.categories.push(category);
    return category;
  }

  remove(id: number): void {
    const index = this.categories.findIndex((c) => c.id === id);
    if (index === -1) {
      throw new NotFoundException(`Categoria ${id} não encontrada`);
    }
    this.categories.splice(index, 1);
  }
}
