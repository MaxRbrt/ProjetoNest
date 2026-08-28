import { ILike, Repository } from 'typeorm';
import { CategoriesService } from '../categorias/categories.service';
import { Product } from './entities/product.entity';
import { ProductsService } from './products.service';

describe('Serviço de produtos', () => {
  let repository: { findAndCount: jest.Mock };
  let service: ProductsService;

  beforeEach(() => {
    repository = { findAndCount: jest.fn().mockResolvedValue([[], 0]) };
    service = new ProductsService(
      repository as unknown as Repository<Product>,
      {} as CategoriesService,
    );
  });

  // ---------------------------------------------
  // Listagem sem filtro
  // ---------------------------------------------
  it('lista sem cláusula de filtro quando nenhum é enviado', async () => {
    await service.findAll({});

    expect(repository.findAndCount).toHaveBeenCalledWith({
      where: {},
      order: { id: 'ASC' },
      skip: 0,
      take: 20,
    });
  });

  // ---------------------------------------------
  // Filtro por categoria e busca por nome
  // ---------------------------------------------
  it('filtra por categoria quando categoryId é enviado', async () => {
    await service.findAll({ categoryId: 3 });

    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { categoryId: 3 } }),
    );
  });

  it('busca por nome parcial sem diferenciar maiúsculas', async () => {
    await service.findAll({ name: 'caneca' });

    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: ILike('%caneca%') } }),
    );
  });

  it('combina filtro de categoria e busca por nome', async () => {
    await service.findAll({ categoryId: 3, name: 'caneca' });

    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { categoryId: 3, name: ILike('%caneca%') },
      }),
    );
  });

  it('ignora nome composto só de espaços', async () => {
    await service.findAll({ name: '   ' });

    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  // ---------------------------------------------
  // Filtro combinado com paginação
  // ---------------------------------------------
  it('aplica o filtro junto com skip e take da página pedida', async () => {
    repository.findAndCount.mockResolvedValue([[], 42]);

    const result = await service.findAll({
      categoryId: 3,
      page: 2,
      limit: 10,
    });

    expect(repository.findAndCount).toHaveBeenCalledWith({
      where: { categoryId: 3 },
      order: { id: 'ASC' },
      skip: 10,
      take: 10,
    });
    expect(result).toEqual({ data: [], total: 42, page: 2, limit: 10 });
  });
});
