import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CategoriesService } from '../categories/categories.service';
import { OrderItem } from '../orders/entities/order-item.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    private readonly categoriesService: CategoriesService,
  ) {}

  // ---------------------------------------------
  // Listagem de produtos
  // ---------------------------------------------
  findAll(): Promise<Product[]> {
    return this.productsRepository.find();
  }

  // ---------------------------------------------
  // Consulta de produto por identificador
  // ---------------------------------------------
  async findOne(id: number): Promise<Product> {
    const product = await this.productsRepository.findOneBy({ id });
    if (!product) {
      throw new NotFoundException(`Produto ${id} não encontrado`);
    }
    return product;
  }

  // ---------------------------------------------
  // Criação de produto
  // ---------------------------------------------
  async create(dto: CreateProductDto): Promise<Product> {
    await this.categoriesService.findOne(dto.categoryId);
    const product = this.productsRepository.create(dto);
    return this.productsRepository.save(product);
  }

  // ---------------------------------------------
  // Atualização de produto
  // ---------------------------------------------
  async update(id: number, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findOne(id);
    if (dto.categoryId !== undefined) {
      await this.categoriesService.findOne(dto.categoryId);
    }
    Object.assign(product, dto);
    return this.productsRepository.save(product);
  }

  // ---------------------------------------------
  // Remoção com checagem de pedidos
  // ---------------------------------------------
  async remove(id: number): Promise<void> {
    const product = await this.findOne(id);
    const orderItemsCount = await this.productsRepository.manager.countBy(
      OrderItem,
      { productId: id },
    );
    // A checagem explícita converte a dependência em um conflito de negócio
    // compreensível antes de tentar violar a chave estrangeira.
    if (orderItemsCount > 0) {
      throw new ConflictException(
        `Não é possível remover o produto ${id}: existem pedidos vinculados a ele`,
      );
    }
    await this.productsRepository.remove(product);
  }
}
