import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Paginated,
  resolvePagination,
  toPaginated,
} from '../../common/dto/paginated';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Category } from './category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Product } from '../produtos/product.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
  ) {}

  // ---------------------------------------------
  // Listagem paginada de categorias
  // A ordenação por id é obrigatória, não estética: sem ORDER BY o Postgres
  // não garante ordem entre consultas, e a mesma categoria poderia aparecer
  // em duas páginas ou sumir de todas conforme o plano de execução mudasse.
  // ---------------------------------------------
  async findAll(query: PaginationQueryDto): Promise<Paginated<Category>> {
    const { page, limit, skip, take } = resolvePagination(query);
    const [data, total] = await this.categoriesRepository.findAndCount({
      order: { id: 'ASC' },
      skip,
      take,
    });
    return toPaginated(data, total, page, limit);
  }

  // ---------------------------------------------
  // Consulta de categoria por identificador
  // ---------------------------------------------
  async findOne(id: number): Promise<Category> {
    const category = await this.categoriesRepository.findOneBy({ id });
    if (!category) {
      throw new NotFoundException(`Categoria ${id} não encontrada`);
    }
    return category;
  }

  // ---------------------------------------------
  // Criação de categoria
  // ---------------------------------------------
  create(dto: CreateCategoryDto): Promise<Category> {
    const category = this.categoriesRepository.create(dto);
    return this.categoriesRepository.save(category);
  }

  // ---------------------------------------------
  // Atualização de categoria
  // Campo ausente no DTO preserva o valor atual: o Object.assign só sobrescreve
  // o que veio na requisição, espelhando o comportamento de produtos.
  // ---------------------------------------------
  async update(id: number, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findOne(id);
    Object.assign(category, dto);
    return this.categoriesRepository.save(category);
  }

  // ---------------------------------------------
  // Remoção com checagem de produtos
  // ---------------------------------------------
  async remove(id: number): Promise<void> {
    const category = await this.findOne(id);
    const productsCount = await this.categoriesRepository.manager.countBy(
      Product,
      { categoryId: id },
    );
    // A checagem explícita devolve um conflito de domínio antes que a chave
    // estrangeira rejeite a exclusão com um erro de infraestrutura.
    if (productsCount > 0) {
      throw new ConflictException(
        `Não é possível remover a categoria ${id}: existem produtos vinculados a ela`,
      );
    }
    await this.categoriesRepository.remove(category);
  }
}
