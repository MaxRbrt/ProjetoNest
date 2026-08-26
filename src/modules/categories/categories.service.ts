import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { Product } from '../products/entities/product.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
  ) {}

  findAll(): Promise<Category[]> {
    return this.categoriesRepository.find();
  }

  async findOne(id: number): Promise<Category> {
    const category = await this.categoriesRepository.findOneBy({ id });
    if (!category) {
      throw new NotFoundException(`Categoria ${id} não encontrada`);
    }
    return category;
  }

  create(dto: CreateCategoryDto): Promise<Category> {
    const category = this.categoriesRepository.create(dto);
    return this.categoriesRepository.save(category);
  }

  async remove(id: number): Promise<void> {
    const category = await this.findOne(id);
    const productsCount = await this.categoriesRepository.manager.countBy(
      Product,
      { categoryId: id },
    );
    if (productsCount > 0) {
      throw new ConflictException(
        `Não é possível remover a categoria ${id}: existem produtos vinculados a ela`,
      );
    }
    await this.categoriesRepository.remove(category);
  }
}
