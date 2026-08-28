import { DataSource, Repository } from 'typeorm';
import { extractTarget, promoteAdmin } from '../../scripts/seed-admin';
import { Role, User } from '../modules/usuarios/entities/user.entity';

describe('Script de promoção a administrador', () => {
  const target = {
    user: 'app_user',
    host: 'db.example.com',
    port: '5432',
    database: 'projeto_test',
  };
  const confirmedTarget =
    '--confirm-target=app_user@db.example.com:5432/projeto_test';

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

    await expect(
      promoteAdmin('   ', createDataSource, target, confirmedTarget),
    ).rejects.toThrow(
      'Informe o email: npm run seed:admin -- usuario@example.com',
    );
    expect(createDataSource).not.toHaveBeenCalled();
  });

  it('remove espaços e converte o email para minúsculas', async () => {
    const { repository, createDataSource } = createDependencies(null);

    await expect(
      promoteAdmin(
        '  ADMIN@EXAMPLE.COM  ',
        createDataSource,
        target,
        confirmedTarget,
      ),
    ).rejects.toThrow(
      'Usuário admin@example.com não encontrado. Cadastre-o primeiro.',
    );
    expect(repository.findOneBy).toHaveBeenCalledWith({
      email: 'admin@example.com',
    });
  });

  // ---------------------------------------------
  // Confirmação do banco alvo
  // Protege contra promoção acidental no banco errado (ex.: NODE_ENV com
  // typo caindo silenciosamente em DATABASE_URL de produção).
  // ---------------------------------------------
  it('falha sem confirmação do alvo antes de criar a conexão', async () => {
    const createDataSource = jest.fn();

    await expect(
      promoteAdmin('cliente@example.com', createDataSource, target, undefined),
    ).rejects.toThrow(
      'Confirme o banco alvo antes de promover: rode novamente com --confirm-target=app_user@db.example.com:5432/projeto_test',
    );
    expect(createDataSource).not.toHaveBeenCalled();
  });

  it('falha quando a confirmação não bate com o alvo real', async () => {
    const createDataSource = jest.fn();

    await expect(
      promoteAdmin(
        'cliente@example.com',
        createDataSource,
        target,
        '--confirm-target=outro_user@outro-host.com:5432/outro_banco',
      ),
    ).rejects.toThrow('Confirme o banco alvo antes de promover');
    expect(createDataSource).not.toHaveBeenCalled();
  });

  it('extrai usuário, host, porta e nome do banco de uma URL do Postgres', () => {
    expect(
      extractTarget(
        'postgresql://app_user:senha@db.example.com:5432/projeto_test',
      ),
    ).toEqual({
      user: 'app_user',
      host: 'db.example.com',
      port: '5432',
      database: 'projeto_test',
    });
  });

  it('usa a porta padrão 5432 quando a URL não declara porta', () => {
    expect(
      extractTarget('postgresql://app_user:senha@db.example.com/projeto_test'),
    ).toEqual({
      user: 'app_user',
      host: 'db.example.com',
      port: '5432',
      database: 'projeto_test',
    });
  });

  it('distingue bancos diferentes atrás do mesmo host de pooler (Supabase)', () => {
    // Achado do Codex: dois projetos podem compartilhar host, mudando só o
    // usuário (postgres.<ref>) ou a porta (pooler de sessão vs. transação).
    // host/database sozinhos não bastam para identificar o banco.
    const projetoA = extractTarget(
      'postgresql://postgres.projeto_a:senha@pooler.example.com:5432/postgres',
    );
    const projetoB = extractTarget(
      'postgresql://postgres.projeto_b:senha@pooler.example.com:6543/postgres',
    );
    expect(projetoA).not.toEqual(projetoB);
  });

  // ---------------------------------------------
  // Promoção e encerramento da conexão
  // ---------------------------------------------
  it('informa em PT-BR quando o usuário não existe e destrói a conexão', async () => {
    const { dataSource, createDataSource } = createDependencies(null);

    await expect(
      promoteAdmin(
        'ausente@example.com',
        createDataSource,
        target,
        confirmedTarget,
      ),
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
      promoteAdmin(
        'cliente@example.com',
        createDataSource,
        target,
        confirmedTarget,
      ),
    ).resolves.toBe('Usuário cliente@example.com promovido a ADMIN.');
    expect(user.role).toBe(Role.ADMIN);
    expect(repository.save).toHaveBeenCalledWith(user);
    expect(dataSource.destroy).toHaveBeenCalledTimes(1);
  });
});
