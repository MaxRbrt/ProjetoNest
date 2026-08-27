import { DataSource, Repository } from 'typeorm';
import { promoteAdmin } from '../../scripts/seed-admin';
import { Role, User } from '../modules/usuarios/entities/user.entity';

describe('Script de promoção a administrador', () => {
  function createDependencies(user: User | null) {
    const repository = {
      findOneBy: jest.fn().mockResolvedValue(user),
      save: jest.fn().mockResolvedValue(user),
    } as unknown as Repository<User>;
    const dataSource = {
      initialize: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn().mockReturnValue(repository),
      destroy: jest.fn().mockResolvedValue(undefined),
    } as unknown as DataSource;
    const createDataSource = jest.fn(() => dataSource);

    return { repository, dataSource, createDataSource };
  }

  // ---------------------------------------------
  // Validação e normalização do email
  // ---------------------------------------------
  it('falha sem email antes de criar ou inicializar a conexão', async () => {
    const createDataSource = jest.fn();

    await expect(promoteAdmin('   ', createDataSource)).rejects.toThrow(
      'Informe o email: npm run seed:admin -- usuario@example.com',
    );
    expect(createDataSource).not.toHaveBeenCalled();
  });

  it('remove espaços e converte o email para minúsculas', async () => {
    const { repository, createDataSource } = createDependencies(null);

    await expect(
      promoteAdmin('  ADMIN@EXAMPLE.COM  ', createDataSource),
    ).rejects.toThrow(
      'Usuário admin@example.com não encontrado. Cadastre-o primeiro.',
    );
    expect(repository.findOneBy).toHaveBeenCalledWith({
      email: 'admin@example.com',
    });
  });

  // ---------------------------------------------
  // Promoção e encerramento da conexão
  // ---------------------------------------------
  it('informa em PT-BR quando o usuário não existe e destrói a conexão', async () => {
    const { dataSource, createDataSource } = createDependencies(null);

    await expect(
      promoteAdmin('ausente@example.com', createDataSource),
    ).rejects.toThrow(
      'Usuário ausente@example.com não encontrado. Cadastre-o primeiro.',
    );
    expect(dataSource.destroy).toHaveBeenCalledTimes(1);
  });

  it('atribui ADMIN ao usuário existente, salva e destrói a conexão', async () => {
    const user = Object.assign(new User(), {
      id: 'e53a16af-a3a9-46a5-a3ec-e00f14e07792',
      email: 'cliente@example.com',
      passwordHash: 'hash',
      role: Role.CLIENTE,
      emailVerifiedAt: new Date('2026-08-27T10:00:00.000Z'),
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: new Date('2026-08-27T09:00:00.000Z'),
      updatedAt: new Date('2026-08-27T09:00:00.000Z'),
    });
    const { repository, dataSource, createDataSource } =
      createDependencies(user);

    await expect(
      promoteAdmin('cliente@example.com', createDataSource),
    ).resolves.toBe('Usuário cliente@example.com promovido a ADMIN.');
    expect(user.role).toBe(Role.ADMIN);
    expect(repository.save).toHaveBeenCalledWith(user);
    expect(dataSource.destroy).toHaveBeenCalledTimes(1);
  });
});
