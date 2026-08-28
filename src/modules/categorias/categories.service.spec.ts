import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CategoriesService } from './categories.service';
import { Category } from './entities/category.entity';

describe('Serviço de categorias', () => {
  let repository: {
    find: jest.Mock;
    findAndCount: jest.Mock;
    findOneBy: jest.Mock;
    save: jest.Mock;
  };
  let service: CategoriesService;

  beforeEach(() => {
    repository = {
      find: jest.fn(),
      findAndCount: jest.fn(),
      findOneBy: jest.fn(),
      save: jest.fn().mockImplementation((entity: unknown) => entity),
    };
    service = new CategoriesService(
      repository as unknown as Repository<Category>,
    );
  });

  // ---------------------------------------------
  // Atualização de categoria
  // ---------------------------------------------
  it('atualiza o nome da categoria existente', async () => {
    const category = Object.assign(new Category(), {
      id: 3,
      name: 'Nome antigo',
    });
    repository.findOneBy.mockResolvedValue(category);

    const result = await service.update(3, { name: 'Nome novo' });

    expect(result.name).toBe('Nome novo');
    expect(repository.save).toHaveBeenCalledWith(category);
  });

  it('devolve 404 ao atualizar categoria inexistente', async () => {
    repository.findOneBy.mockResolvedValue(null);

    await expect(
      service.update(99, { name: 'Qualquer' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('mantém o nome atual quando o campo não é enviado', async () => {
    const category = Object.assign(new Category(), {
      id: 3,
      name: 'Nome preservado',
    });
    repository.findOneBy.mockResolvedValue(category);

    const result = await service.update(3, {});

    expect(result.name).toBe('Nome preservado');
  });
  // ---------------------------------------------
  // Validação do nome recebido
  // O DTO precisa barrar nome em branco e nome maior que a coluna antes de
  // chegar ao banco, senão viram gravação inválida ou erro interno.
  // ---------------------------------------------
  it('recusa nome composto apenas de espaços', () => {
    const dto = plainToInstance(UpdateCategoryDto, { name: '   ' });
    expect(validateSync(dto)).not.toHaveLength(0);
  });

  it('recusa nome acima de 255 caracteres', () => {
    const dto = plainToInstance(UpdateCategoryDto, { name: 'a'.repeat(256) });
    expect(validateSync(dto)).not.toHaveLength(0);
  });

  it('remove espaços das pontas do nome válido', () => {
    const dto = plainToInstance(UpdateCategoryDto, { name: '  Bebidas  ' });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.name).toBe('Bebidas');
  });
});
