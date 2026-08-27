import { BadRequestException } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { User } from '../../usuarios/entities/user.entity';
import {
  AuthActionToken,
  AuthActionTokenType,
} from '../entities/auth-action-token.entity';
import { ActionTokensService } from './action-tokens.service';
import { OpaqueTokenService } from './opaque-token.service';
import { SessionsService } from './sessions.service';

describe('ActionTokensService', () => {
  let manager: jest.Mocked<
    Pick<EntityManager, 'create' | 'save' | 'findOne' | 'update'>
  >;
  let repository: Repository<AuthActionToken>;
  let sessions: jest.Mocked<Pick<SessionsService, 'revokeAllWithManager'>>;
  let service: ActionTokensService;
  const opaqueTokens = new OpaqueTokenService();
  const user = Object.assign(new User(), {
    id: 'f2fa55e8-9bb4-4d42-8545-1ecae77bc327',
    email: 'usuario@example.com',
    emailVerifiedAt: null,
  });

  beforeEach(() => {
    user.emailVerifiedAt = null;
    user.passwordHash = '';
    manager = {
      create: jest.fn((target: new () => unknown, input: object) =>
        Object.assign(new target(), input),
      ),
      save: jest.fn(async (entity: AuthActionToken | User) => {
        if (entity instanceof AuthActionToken && !entity.id) {
          entity.id = '4a76e6ec-61c1-497e-931a-e1e8f9c15331';
          entity.createdAt = new Date('2026-08-26T12:00:00.000Z');
        }
        return entity;
      }),
      findOne: jest.fn(),
      update: jest.fn(),
    } as unknown as typeof manager;
    repository = {
      manager: {
        transaction: jest.fn((callback) => callback(manager as EntityManager)),
      },
    } as unknown as Repository<AuthActionToken>;
    sessions = { revokeAllWithManager: jest.fn().mockResolvedValue(undefined) };
    service = new ActionTokensService(
      repository,
      opaqueTokens,
      sessions as SessionsService,
    );
  });

  // ---------------------------------------------
  // Emissão de tokens de ação
  // ---------------------------------------------
  it('emite verificação de 24 horas e persiste somente o hash', async () => {
    manager.findOne.mockResolvedValue(null);
    const now = new Date('2026-08-26T12:00:00.000Z');

    const issued = await service.issueEmailVerification(
      manager as EntityManager,
      user.id,
      now,
    );
    const saved = manager.save.mock.calls[0][0] as AuthActionToken;

    expect(issued?.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(saved.tokenHash).toBe(opaqueTokens.hash(issued!.rawToken));
    expect(saved.type).toBe(AuthActionTokenType.EMAIL_VERIFICATION);
    expect(saved.expiresAt.getTime() - now.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(saved).not.toHaveProperty('rawToken');
  });

  it('respeita intervalo mínimo de cinco minutos para verificação', async () => {
    manager.findOne.mockResolvedValue(
      Object.assign(new AuthActionToken(), {
        createdAt: new Date('2026-08-26T11:58:00.000Z'),
      }),
    );

    await expect(
      service.issueEmailVerification(
        manager as EntityManager,
        user.id,
        new Date('2026-08-26T12:00:00.000Z'),
      ),
    ).resolves.toBeNull();
    expect(manager.save).not.toHaveBeenCalled();
  });

  // ---------------------------------------------
  // Consumo de verificação de email
  // ---------------------------------------------
  it('consome verificação uma vez e marca o usuário', async () => {
    const opaque = opaqueTokens.generate();
    const action = Object.assign(new AuthActionToken(), {
      id: '4a76e6ec-61c1-497e-931a-e1e8f9c15331',
      userId: user.id,
      type: AuthActionTokenType.EMAIL_VERIFICATION,
      tokenHash: opaque.tokenHash,
      expiresAt: new Date('2026-08-27T12:00:00.000Z'),
      usedAt: null,
    });
    manager.findOne.mockImplementation(async (target) => {
      if (target === AuthActionToken) return action;
      if (target === User) return user;
      return null;
    });

    await service.verifyEmail(
      opaque.rawToken,
      new Date('2026-08-26T12:00:00.000Z'),
    );

    expect(action.usedAt).toEqual(new Date('2026-08-26T12:00:00.000Z'));
    expect(user.emailVerifiedAt).toEqual(new Date('2026-08-26T12:00:00.000Z'));
  });

  it('trava usuário antes do token de ação e revalida após ambos os bloqueios', async () => {
    const opaque = opaqueTokens.generate();
    const action = Object.assign(new AuthActionToken(), {
      id: '4a76e6ec-61c1-497e-931a-e1e8f9c15331',
      userId: user.id,
      type: AuthActionTokenType.EMAIL_VERIFICATION,
      tokenHash: opaque.tokenHash,
      expiresAt: new Date('2026-08-27T12:00:00.000Z'),
      usedAt: null,
    });
    manager.findOne.mockImplementation(async (target) => {
      if (target === AuthActionToken) return action;
      if (target === User) return user;
      return null;
    });

    await service.verifyEmail(
      opaque.rawToken,
      new Date('2026-08-26T12:00:00.000Z'),
    );

    const calls = manager.findOne.mock.calls;
    expect(calls.map(([target]) => target)).toEqual([
      AuthActionToken,
      User,
      AuthActionToken,
    ]);
    expect(calls[0][1]).not.toHaveProperty('lock');
    expect(calls[1][1]).toHaveProperty('lock.mode', 'pessimistic_write');
    expect(calls[2][1]).toHaveProperty('lock.mode', 'pessimistic_write');
  });

  it('rejeita token expirado sem alterar o usuário', async () => {
    const opaque = opaqueTokens.generate();
    manager.findOne.mockResolvedValue(
      Object.assign(new AuthActionToken(), {
        type: AuthActionTokenType.EMAIL_VERIFICATION,
        tokenHash: opaque.tokenHash,
        expiresAt: new Date('2026-08-26T11:59:00.000Z'),
        usedAt: null,
      }),
    );

    await expect(
      service.verifyEmail(
        opaque.rawToken,
        new Date('2026-08-26T12:00:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(user.emailVerifiedAt).toBeNull();
  });

  // ---------------------------------------------
  // Redefinição de senha e revogação de sessões
  // ---------------------------------------------
  it('reset troca o hash e revoga todas as sessões na mesma transação', async () => {
    const opaque = opaqueTokens.generate();
    const action = Object.assign(new AuthActionToken(), {
      id: '4a76e6ec-61c1-497e-931a-e1e8f9c15331',
      userId: user.id,
      type: AuthActionTokenType.PASSWORD_RESET,
      tokenHash: opaque.tokenHash,
      expiresAt: new Date('2026-08-26T12:15:00.000Z'),
      usedAt: null,
    });
    manager.findOne.mockImplementation(async (target) => {
      if (target === AuthActionToken) return action;
      if (target === User) return user;
      return null;
    });

    await service.resetPassword(
      opaque.rawToken,
      'novo-hash-argon2',
      new Date('2026-08-26T12:00:00.000Z'),
    );

    expect(user.passwordHash).toBe('novo-hash-argon2');
    expect(action.usedAt).toEqual(new Date('2026-08-26T12:00:00.000Z'));
    expect(sessions.revokeAllWithManager).toHaveBeenCalledWith(
      manager,
      user.id,
      new Date('2026-08-26T12:00:00.000Z'),
    );
  });
});
