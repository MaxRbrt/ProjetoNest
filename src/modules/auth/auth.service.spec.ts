import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager, Repository } from 'typeorm';
import { AuthEmailService } from '../email/email.service';
import { User } from '../usuarios/entities/user.entity';
import { GENERIC_ACCEPTED_RESPONSE } from './auth.constants';
import { AuthService } from './auth.service';
import { ActionTokensService } from './services/action-tokens.service';
import { PasswordService } from './services/password.service';
import {
  AuthenticatedSession,
  PersistedSession,
  SessionsService,
} from './services/sessions.service';

describe('AuthService', () => {
  let manager: jest.Mocked<Pick<EntityManager, 'create' | 'save' | 'findOne'>>;
  let usersRepository: Repository<User>;
  let passwords: jest.Mocked<
    Pick<PasswordService, 'hash' | 'verify' | 'verifyDummy'>
  >;
  let actions: jest.Mocked<
    Pick<
      ActionTokensService,
      | 'issueEmailVerification'
      | 'issuePasswordReset'
      | 'verifyEmail'
      | 'resetPassword'
    >
  >;
  let sessions: jest.Mocked<
    Pick<
      SessionsService,
      'createWithManager' | 'complete' | 'refresh' | 'logout'
    >
  >;
  let email: jest.Mocked<AuthEmailService>;
  let service: AuthService;
  const now = new Date('2026-08-26T12:00:00.000Z');

  beforeEach(() => {
    manager = {
      create: jest.fn((target: new () => unknown, input: object) =>
        Object.assign(new target(), input),
      ),
      save: jest.fn(async (entity: User) => {
        entity.id ??= 'f2fa55e8-9bb4-4d42-8545-1ecae77bc327';
        entity.createdAt ??= now;
        return entity;
      }),
      findOne: jest.fn(),
    } as unknown as typeof manager;
    usersRepository = {
      manager: {
        transaction: jest.fn((callback) => callback(manager as EntityManager)),
      },
    } as unknown as Repository<User>;
    passwords = {
      hash: jest.fn().mockResolvedValue('hash-argon2'),
      verify: jest.fn(),
      verifyDummy: jest.fn().mockResolvedValue(false),
    };
    actions = {
      issueEmailVerification: jest.fn().mockResolvedValue({
        actionTokenId: 'action-id',
        rawToken: 'A'.repeat(43),
        expiresAt: new Date('2026-08-27T12:00:00.000Z'),
      }),
      issuePasswordReset: jest.fn(),
      verifyEmail: jest.fn(),
      resetPassword: jest.fn(),
    };
    sessions = {
      createWithManager: jest.fn(),
      complete: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
    };
    email = {
      sendEmailVerification: jest.fn(),
      sendPasswordReset: jest.fn(),
    };
    const config = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'AUTH_MIN_RESPONSE_MS') return 1;
        throw new Error(`Configuração de teste inesperada: ${key}`);
      }),
    } as unknown as ConfigService;
    service = new AuthService(
      usersRepository,
      passwords as PasswordService,
      actions as ActionTokensService,
      sessions as SessionsService,
      email,
      config,
    );
  });

  // ---------------------------------------------
  // Cadastro e reenvio de verificação
  // ---------------------------------------------
  it('cadastra usuário pendente e envia verificação fora da transação', async () => {
    manager.findOne.mockResolvedValue(null);

    await expect(
      service.register(
        { email: 'usuario@example.com', password: 'frase senha segura' },
        now,
      ),
    ).resolves.toEqual(GENERIC_ACCEPTED_RESPONSE);

    const savedUser = manager.save.mock.calls[0][0] as User;
    expect(savedUser.email).toBe('usuario@example.com');
    expect(savedUser.passwordHash).toBe('hash-argon2');
    expect(actions.issueEmailVerification).toHaveBeenCalledWith(
      manager,
      savedUser.id,
      now,
    );
    expect(email.sendEmailVerification).toHaveBeenCalledWith({
      recipient: savedUser.email,
      rawToken: 'A'.repeat(43),
      actionTokenId: 'action-id',
    });
  });

  it('mantém resposta genérica para conta já verificada', async () => {
    manager.findOne.mockResolvedValue(
      Object.assign(new User(), {
        id: 'f2fa55e8-9bb4-4d42-8545-1ecae77bc327',
        email: 'usuario@example.com',
        emailVerifiedAt: now,
      }),
    );

    await expect(
      service.register(
        { email: 'usuario@example.com', password: 'frase senha segura' },
        now,
      ),
    ).resolves.toEqual(GENERIC_ACCEPTED_RESPONSE);
    expect(passwords.hash).toHaveBeenCalled();
    expect(actions.issueEmailVerification).not.toHaveBeenCalled();
    expect(email.sendEmailVerification).not.toHaveBeenCalled();
  });

  // ---------------------------------------------
  // Login e proteção contra enumeração de contas
  // ---------------------------------------------
  it('executa Argon2 fictício e retorna 401 para email inexistente', async () => {
    manager.findOne.mockResolvedValue(null);

    await expect(
      service.login(
        { email: 'ausente@example.com', password: 'tentativa' },
        now,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(passwords.verifyDummy).toHaveBeenCalledWith('tentativa');
  });

  it('bloqueia a conta na quinta falha consecutiva', async () => {
    const user = Object.assign(new User(), {
      id: 'f2fa55e8-9bb4-4d42-8545-1ecae77bc327',
      email: 'usuario@example.com',
      passwordHash: 'hash-argon2',
      emailVerifiedAt: now,
      failedLoginAttempts: 4,
      lockedUntil: null,
    });
    manager.findOne.mockResolvedValue(user);
    passwords.verify.mockResolvedValue(false);

    await expect(
      service.login({ email: user.email, password: 'tentativa' }, now),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(user.failedLoginAttempts).toBe(5);
    expect(user.lockedUntil).toEqual(new Date('2026-08-26T12:15:00.000Z'));
    expect(manager.save).toHaveBeenCalledWith(user);
  });

  it('cria sessão apenas para credencial válida e email verificado', async () => {
    const user = Object.assign(new User(), {
      id: 'f2fa55e8-9bb4-4d42-8545-1ecae77bc327',
      email: 'usuario@example.com',
      passwordHash: 'hash-argon2',
      emailVerifiedAt: now,
      failedLoginAttempts: 2,
      lockedUntil: null,
      createdAt: now,
    });
    const persisted = {
      user,
      sessionId: '4a76e6ec-61c1-497e-931a-e1e8f9c15331',
      refreshToken: 'A'.repeat(43),
      refreshExpiresAt: new Date('2026-09-25T12:00:00.000Z'),
    } satisfies PersistedSession;
    const authenticated = {
      accessToken: 'access-jwt',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        isEmailVerified: true,
        createdAt: now,
      },
      refreshToken: persisted.refreshToken,
      refreshExpiresAt: persisted.refreshExpiresAt,
    } satisfies AuthenticatedSession;
    manager.findOne.mockResolvedValue(user);
    passwords.verify.mockResolvedValue(true);
    sessions.createWithManager.mockResolvedValue(persisted);
    sessions.complete.mockResolvedValue(authenticated);

    await expect(
      service.login({ email: user.email, password: 'senha correta' }, now),
    ).resolves.toBe(authenticated);
    expect(user.failedLoginAttempts).toBe(0);
    expect(user.lockedUntil).toBeNull();
    expect(sessions.createWithManager).toHaveBeenCalledWith(manager, user, now);
    // Sem `role` no select, toPublicUser() monta a resposta do login com
    // role undefined mesmo o usuário tendo papel definido no banco.
    expect(manager.findOne).toHaveBeenCalledWith(
      User,
      expect.objectContaining({
        select: expect.objectContaining({ role: true }),
      }),
    );
  });

  it('recusa login não verificado com o mesmo erro genérico de senha inválida', async () => {
    // Regressão de segurança: um 403 específico aqui revelaria que a senha
    // estava correta (oráculo de senha em conta não verificada). A resposta
    // precisa ser indistinguível de senha errada.
    const user = Object.assign(new User(), {
      id: 'f2fa55e8-9bb4-4d42-8545-1ecae77bc327',
      email: 'usuario@example.com',
      passwordHash: 'hash-argon2',
      emailVerifiedAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
    manager.findOne.mockResolvedValue(user);
    passwords.verify.mockResolvedValue(true);

    await expect(
      service.login({ email: user.email, password: 'senha correta' }, now),
    ).rejects.toMatchObject({
      status: 401,
      message: 'Email ou senha inválidos.',
    });
    expect(sessions.createWithManager).not.toHaveBeenCalled();
  });

  it('mantém a resposta de senha errada idêntica à de conta não verificada', async () => {
    const user = Object.assign(new User(), {
      id: 'f2fa55e8-9bb4-4d42-8545-1ecae77bc327',
      email: 'usuario@example.com',
      passwordHash: 'hash-argon2',
      emailVerifiedAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
    manager.findOne.mockResolvedValue(user);
    passwords.verify.mockResolvedValue(false);

    await expect(
      service.login({ email: user.email, password: 'senha errada' }, now),
    ).rejects.toMatchObject({
      status: 401,
      message: 'Email ou senha inválidos.',
    });
    expect(sessions.createWithManager).not.toHaveBeenCalled();
  });

  // ---------------------------------------------
  // Recuperação de senha
  // ---------------------------------------------
  it('envia reset somente para usuário verificado e sem token ativo', async () => {
    const user = Object.assign(new User(), {
      id: 'f2fa55e8-9bb4-4d42-8545-1ecae77bc327',
      email: 'usuario@example.com',
      emailVerifiedAt: now,
    });
    manager.findOne.mockResolvedValue(user);
    actions.issuePasswordReset.mockResolvedValue({
      actionTokenId: 'reset-id',
      rawToken: 'R'.repeat(43),
      expiresAt: new Date('2026-08-26T12:15:00.000Z'),
    });

    await expect(
      service.forgotPassword({ email: user.email }, now),
    ).resolves.toEqual(GENERIC_ACCEPTED_RESPONSE);
    expect(email.sendPasswordReset).toHaveBeenCalledWith({
      recipient: user.email,
      rawToken: 'R'.repeat(43),
      actionTokenId: 'reset-id',
    });
  });

  it('valida nova senha antes de consumir o token de reset', async () => {
    await service.resetPassword(
      { token: 'R'.repeat(43), newPassword: 'nova frase senha segura' },
      now,
    );

    expect(passwords.hash).toHaveBeenCalledWith('nova frase senha segura');
    expect(actions.resetPassword).toHaveBeenCalledWith(
      'R'.repeat(43),
      'hash-argon2',
      now,
    );
  });

  // ---------------------------------------------
  // Verificação de email
  // ---------------------------------------------
  it('delega verificação de email preservando uso único', async () => {
    await service.verifyEmail({ token: 'V'.repeat(43) }, now);

    expect(actions.verifyEmail).toHaveBeenCalledWith('V'.repeat(43), now);
  });
});
