import { Repository } from 'typeorm';
import { Role, User } from './entities/user.entity';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const repository = {
    findOneBy: jest.fn(),
  } as unknown as Repository<User>;
  const service = new UsersService(repository);

  // ---------------------------------------------
  // Exposição segura dos dados do usuário
  // ---------------------------------------------
  it('expõe somente os campos públicos do usuário', () => {
    const user = Object.assign(new User(), {
      id: 'f2fa55e8-9bb4-4d42-8545-1ecae77bc327',
      email: 'usuario@example.com',
      passwordHash: 'hash-que-nao-pode-vazar',
      emailVerifiedAt: new Date('2026-08-26T12:00:00.000Z'),
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: new Date('2026-08-26T10:00:00.000Z'),
      updatedAt: new Date('2026-08-26T12:00:00.000Z'),
    });

    expect(service.toPublicUser(user)).toEqual({
      id: user.id,
      email: user.email,
      isEmailVerified: true,
      createdAt: user.createdAt,
    });
    expect(service.toPublicUser(user)).not.toHaveProperty('passwordHash');
  });

  it('representa email pendente sem expor a data interna de verificação', () => {
    const user = Object.assign(new User(), {
      id: 'f2fa55e8-9bb4-4d42-8545-1ecae77bc327',
      email: 'usuario@example.com',
      emailVerifiedAt: null,
      createdAt: new Date('2026-08-26T10:00:00.000Z'),
    });

    expect(service.toPublicUser(user).isEmailVerified).toBe(false);
    expect(service.toPublicUser(user)).not.toHaveProperty('emailVerifiedAt');
  });

  // ---------------------------------------------
  // Exposição do papel de acesso
  // ---------------------------------------------
  it('expõe o papel do usuário no PublicUser', () => {
    const user = Object.assign(new User(), {
      id: '6f5c2c1e-9c4a-4c1a-9f1a-2b3c4d5e6f70',
      email: 'cliente@example.com',
      emailVerifiedAt: new Date('2026-08-27T10:00:00Z'),
      createdAt: new Date('2026-08-27T09:00:00Z'),
      role: Role.CLIENTE,
    });

    expect(service.toPublicUser(user)).toEqual({
      id: '6f5c2c1e-9c4a-4c1a-9f1a-2b3c4d5e6f70',
      email: 'cliente@example.com',
      isEmailVerified: true,
      createdAt: new Date('2026-08-27T09:00:00Z'),
      role: Role.CLIENTE,
    });
  });
});
