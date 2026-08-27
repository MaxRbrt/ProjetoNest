import { UnauthorizedException } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { User } from '../../usuarios/entities/user.entity';
import { PublicUser, UsersService } from '../../usuarios/users.service';
import { AuthSession } from '../entities/auth-session.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { AccessTokenService } from './access-token.service';
import { OpaqueTokenService } from './opaque-token.service';
import { SessionsService } from './sessions.service';

describe('SessionsService', () => {
  let manager: jest.Mocked<
    Pick<EntityManager, 'create' | 'save' | 'findOne' | 'update'>
  >;
  let sessionsRepository: Repository<AuthSession>;
  let accessTokens: jest.Mocked<Pick<AccessTokenService, 'issue'>>;
  let users: jest.Mocked<Pick<UsersService, 'findById' | 'toPublicUser'>>;
  let service: SessionsService;
  const opaqueTokens = new OpaqueTokenService();
  const user = Object.assign(new User(), {
    id: 'f2fa55e8-9bb4-4d42-8545-1ecae77bc327',
    email: 'usuario@example.com',
    emailVerifiedAt: new Date('2026-08-26T10:00:00.000Z'),
    createdAt: new Date('2026-08-26T09:00:00.000Z'),
  });
  const publicUser: PublicUser = {
    id: user.id,
    email: user.email,
    isEmailVerified: true,
    createdAt: user.createdAt,
  };

  beforeEach(() => {
    let nextRefreshId = 0;
    manager = {
      create: jest.fn((target: new () => unknown, input: object) =>
        Object.assign(new target(), input),
      ),
      save: jest.fn(async (entity: AuthSession | RefreshToken) => {
        if (entity instanceof AuthSession && !entity.id) {
          entity.id = '4a76e6ec-61c1-497e-931a-e1e8f9c15331';
        }
        if (entity instanceof RefreshToken && !entity.id) {
          nextRefreshId += 1;
          entity.id = `00000000-0000-4000-8000-${String(nextRefreshId).padStart(12, '0')}`;
        }
        return entity;
      }),
      findOne: jest.fn(),
      update: jest.fn(),
    } as unknown as typeof manager;
    sessionsRepository = {
      manager: {
        transaction: jest.fn((callback) => callback(manager as EntityManager)),
      },
      findOne: jest.fn(),
    } as unknown as Repository<AuthSession>;
    accessTokens = { issue: jest.fn().mockResolvedValue('access-jwt') };
    users = {
      findById: jest.fn().mockResolvedValue(user),
      toPublicUser: jest.fn().mockReturnValue(publicUser),
    };
    service = new SessionsService(
      sessionsRepository,
      opaqueTokens,
      accessTokens as AccessTokenService,
      users as UsersService,
    );
  });

  // ---------------------------------------------
  // Criação de sessão
  // ---------------------------------------------
  it('cria sessão absoluta e persiste somente o hash do refresh', async () => {
    const now = new Date('2026-08-26T12:00:00.000Z');
    const result = await service.create(user, now);
    const savedRefresh = manager.save.mock.calls
      .map(([entity]) => entity)
      .find((entity): entity is RefreshToken => entity instanceof RefreshToken);

    expect(result).toEqual(
      expect.objectContaining({
        accessToken: 'access-jwt',
        expiresIn: 900,
        user: publicUser,
        refreshToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      }),
    );
    expect(result.refreshExpiresAt.getTime() - now.getTime()).toBe(
      30 * 24 * 60 * 60 * 1000,
    );
    expect(savedRefresh?.tokenHash).toBe(
      opaqueTokens.hash(result.refreshToken),
    );
    expect(savedRefresh).not.toHaveProperty('rawToken');
  });

  // ---------------------------------------------
  // Rotação e proteção do refresh token
  // ---------------------------------------------
  it('rotaciona refresh sob transação e vincula a geração seguinte', async () => {
    const original = opaqueTokens.generate();
    const session = Object.assign(new AuthSession(), {
      id: '4a76e6ec-61c1-497e-931a-e1e8f9c15331',
      userId: user.id,
      expiresAt: new Date('2026-09-20T12:00:00.000Z'),
      revokedAt: null,
    });
    const refresh = Object.assign(new RefreshToken(), {
      id: '11111111-1111-4111-8111-111111111111',
      sessionId: session.id,
      tokenHash: original.tokenHash,
      expiresAt: session.expiresAt,
      usedAt: null,
      revokedAt: null,
      replacedByTokenId: null,
    });
    manager.findOne.mockImplementation(async (target) => {
      if (target === RefreshToken) return refresh;
      if (target === AuthSession) return session;
      if (target === User) return user;
      return null;
    });

    const result = await service.refresh(
      original.rawToken,
      new Date('2026-08-26T12:00:00.000Z'),
    );

    expect(refresh.usedAt).toEqual(new Date('2026-08-26T12:00:00.000Z'));
    expect(refresh.replacedByTokenId).toMatch(/^00000000-0000-4000-8000-/);
    expect(opaqueTokens.hash(result.refreshToken)).not.toBe(original.tokenHash);
    expect(session.revokedAt).toBeNull();
  });

  it('trava usuário, sessão e refresh nessa ordem e revalida os candidatos', async () => {
    const original = opaqueTokens.generate();
    const session = Object.assign(new AuthSession(), {
      id: '4a76e6ec-61c1-497e-931a-e1e8f9c15331',
      userId: user.id,
      expiresAt: new Date('2026-09-20T12:00:00.000Z'),
      revokedAt: null,
    });
    const refresh = Object.assign(new RefreshToken(), {
      id: '11111111-1111-4111-8111-111111111111',
      sessionId: session.id,
      tokenHash: original.tokenHash,
      expiresAt: session.expiresAt,
      usedAt: null,
      revokedAt: null,
      replacedByTokenId: null,
    });
    manager.findOne.mockImplementation(async (target) => {
      if (target === RefreshToken) return refresh;
      if (target === AuthSession) return session;
      if (target === User) return user;
      return null;
    });

    await service.refresh(
      original.rawToken,
      new Date('2026-08-26T12:00:00.000Z'),
    );

    const calls = manager.findOne.mock.calls;
    expect(calls.map(([target]) => target)).toEqual([
      RefreshToken,
      AuthSession,
      User,
      AuthSession,
      RefreshToken,
    ]);
    expect(calls[0][1]).not.toHaveProperty('lock');
    expect(calls[1][1]).not.toHaveProperty('lock');
    expect(calls[2][1]).toHaveProperty('lock.mode', 'pessimistic_write');
    expect(calls[3][1]).toHaveProperty('lock.mode', 'pessimistic_write');
    expect(calls[4][1]).toHaveProperty('lock.mode', 'pessimistic_write');
  });

  it('persiste revogação da sessão antes de rejeitar token reutilizado', async () => {
    const original = opaqueTokens.generate();
    const session = Object.assign(new AuthSession(), {
      id: '4a76e6ec-61c1-497e-931a-e1e8f9c15331',
      userId: user.id,
      expiresAt: new Date('2026-09-20T12:00:00.000Z'),
      revokedAt: null,
    });
    const refresh = Object.assign(new RefreshToken(), {
      id: '11111111-1111-4111-8111-111111111111',
      sessionId: session.id,
      tokenHash: original.tokenHash,
      expiresAt: session.expiresAt,
      usedAt: new Date('2026-08-26T11:59:00.000Z'),
      revokedAt: null,
    });
    manager.findOne.mockImplementation(async (target) => {
      if (target === RefreshToken) return refresh;
      if (target === AuthSession) return session;
      if (target === User) return user;
      return null;
    });

    await expect(
      service.refresh(original.rawToken, new Date('2026-08-26T12:00:00.000Z')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(session.revokedAt).toEqual(new Date('2026-08-26T12:00:00.000Z'));
    expect(manager.save).toHaveBeenCalledWith(session);
    expect(accessTokens.issue).not.toHaveBeenCalled();
  });

  // ---------------------------------------------
  // Encerramento de sessão
  // ---------------------------------------------
  it('logout trava sessão antes do refresh token e revalida o candidato', async () => {
    const original = opaqueTokens.generate();
    const session = Object.assign(new AuthSession(), {
      id: '4a76e6ec-61c1-497e-931a-e1e8f9c15331',
      userId: user.id,
      expiresAt: new Date('2026-09-20T12:00:00.000Z'),
      revokedAt: null,
    });
    const refresh = Object.assign(new RefreshToken(), {
      id: '11111111-1111-4111-8111-111111111111',
      sessionId: session.id,
      tokenHash: original.tokenHash,
      expiresAt: session.expiresAt,
      usedAt: null,
      revokedAt: null,
    });
    manager.findOne.mockImplementation(async (target) => {
      if (target === RefreshToken) return refresh;
      if (target === AuthSession) return session;
      return null;
    });

    await service.logout(
      original.rawToken,
      new Date('2026-08-26T12:00:00.000Z'),
    );

    const calls = manager.findOne.mock.calls;
    expect(calls.map(([target]) => target)).toEqual([
      RefreshToken,
      AuthSession,
      RefreshToken,
    ]);
    expect(calls[0][1]).not.toHaveProperty('lock');
    expect(calls[1][1]).toHaveProperty('lock.mode', 'pessimistic_write');
    expect(calls[2][1]).toHaveProperty('lock.mode', 'pessimistic_write');
  });
});
