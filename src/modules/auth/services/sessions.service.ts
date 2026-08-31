import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, MoreThan, Repository } from 'typeorm';
import { User } from '../../usuarios/user.entity';
import { PublicUser, UsersService } from '../../usuarios/users.service';
import { ACCESS_TOKEN_TTL_SECONDS, SESSION_TTL_MS } from '../auth.constants';
import { AuthSession } from '../entities/auth-session.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { AccessTokenService } from './access-token.service';
import { OpaqueTokenService } from './opaque-token.service';

const INVALID_SESSION_MESSAGE = 'Não foi possível renovar a sessão.';

export interface AuthenticatedSession {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: PublicUser;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface PersistedSession {
  user: User;
  sessionId: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

type RefreshTransactionResult =
  { status: 'invalid' } | ({ status: 'valid' } & PersistedSession);

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(AuthSession)
    private readonly sessionsRepository: Repository<AuthSession>,
    private readonly opaqueTokens: OpaqueTokenService,
    private readonly accessTokens: AccessTokenService,
    private readonly users: UsersService,
  ) {}

  // ---------------------------------------------
  // Criação de sessão
  // ---------------------------------------------
  async create(user: User, now = new Date()): Promise<AuthenticatedSession> {
    const persisted = await this.sessionsRepository.manager.transaction(
      async (manager) => this.createWithManager(manager, user, now),
    );
    return this.complete(persisted);
  }

  // ---------------------------------------------
  // Persistência da sessão e do refresh token
  // ---------------------------------------------
  async createWithManager(
    manager: EntityManager,
    user: User,
    now: Date,
  ): Promise<PersistedSession> {
    const refreshExpiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    const opaque = this.opaqueTokens.generate();
    const session = manager.create(AuthSession, {
      userId: user.id,
      expiresAt: refreshExpiresAt,
      revokedAt: null,
      lastUsedAt: now,
    });
    await manager.save(session);

    const refreshToken = manager.create(RefreshToken, {
      sessionId: session.id,
      tokenHash: opaque.tokenHash,
      expiresAt: refreshExpiresAt,
      usedAt: null,
      revokedAt: null,
      replacedByTokenId: null,
    });
    await manager.save(refreshToken);

    return {
      user,
      sessionId: session.id,
      refreshToken: opaque.rawToken,
      refreshExpiresAt,
    };
  }

  // ---------------------------------------------
  // Rotação de refresh token
  // ---------------------------------------------
  async refresh(
    rawToken: string,
    now = new Date(),
  ): Promise<AuthenticatedSession> {
    const tokenHash = this.opaqueTokens.hash(rawToken);
    const result = await this.sessionsRepository.manager.transaction(
      async (manager): Promise<RefreshTransactionResult> => {
        const tokenCandidate = await manager.findOne(RefreshToken, {
          where: { tokenHash },
        });
        if (!tokenCandidate) {
          return { status: 'invalid' };
        }

        const sessionCandidate = await manager.findOne(AuthSession, {
          where: { id: tokenCandidate.sessionId },
        });
        if (!sessionCandidate) {
          return { status: 'invalid' };
        }

        // Os bloqueios seguem sempre usuário -> sessão -> refresh token. Uma
        // ordem única reduz o risco de interbloqueio com logout e troca de senha.
        const user = await manager.findOne(User, {
          where: { id: sessionCandidate.userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user) {
          return { status: 'invalid' };
        }

        const session = await manager.findOne(AuthSession, {
          where: {
            id: sessionCandidate.id,
            userId: user.id,
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (!session) {
          return { status: 'invalid' };
        }

        const current = await manager.findOne(RefreshToken, {
          where: {
            id: tokenCandidate.id,
            sessionId: session.id,
            tokenHash,
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (!current) {
          return { status: 'invalid' };
        }

        if (current.usedAt || current.revokedAt) {
          // Reutilização indica possível roubo do token; toda a família da
          // sessão é revogada, não apenas o valor reapresentado.
          await this.revokeWithManager(manager, session, now);
          return { status: 'invalid' };
        }

        if (
          current.expiresAt.getTime() <= now.getTime() ||
          session.expiresAt.getTime() <= now.getTime() ||
          session.revokedAt
        ) {
          current.revokedAt ??= now;
          await manager.save(current);
          await this.revokeWithManager(manager, session, now);
          return { status: 'invalid' };
        }

        const nextOpaque = this.opaqueTokens.generate();
        const next = manager.create(RefreshToken, {
          sessionId: session.id,
          tokenHash: nextOpaque.tokenHash,
          expiresAt: session.expiresAt,
          usedAt: null,
          revokedAt: null,
          replacedByTokenId: null,
        });
        await manager.save(next);

        current.usedAt = now;
        current.replacedByTokenId = next.id;
        session.lastUsedAt = now;
        await manager.save(current);
        await manager.save(session);

        return {
          status: 'valid',
          user,
          sessionId: session.id,
          refreshToken: nextOpaque.rawToken,
          refreshExpiresAt: session.expiresAt,
        };
      },
    );

    if (result.status === 'invalid') {
      throw new UnauthorizedException(INVALID_SESSION_MESSAGE);
    }

    return this.complete(result);
  }

  // ---------------------------------------------
  // Encerramento idempotente de sessão
  // ---------------------------------------------
  async logout(rawToken: string | undefined, now = new Date()): Promise<void> {
    if (!rawToken) {
      return;
    }

    const tokenHash = this.opaqueTokens.hash(rawToken);
    await this.sessionsRepository.manager.transaction(async (manager) => {
      const candidate = await manager.findOne(RefreshToken, {
        where: { tokenHash },
      });
      if (!candidate) {
        return;
      }

      // No logout, a sessão é travada antes do refresh para preservar a mesma
      // ordem usada na rotação e evitar interbloqueios concorrentes.
      const session = await manager.findOne(AuthSession, {
        where: { id: candidate.sessionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session) {
        return;
      }

      const token = await manager.findOne(RefreshToken, {
        where: {
          id: candidate.id,
          sessionId: session.id,
          tokenHash,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!token) {
        return;
      }

      await this.revokeWithManager(manager, session, now);
    });
  }

  // ---------------------------------------------
  // Validação de sessão protegida
  // ---------------------------------------------
  async validateActiveSession(
    userId: string,
    sessionId: string,
    now = new Date(),
  ): Promise<PublicUser> {
    const session = await this.sessionsRepository.findOne({
      where: {
        id: sessionId,
        userId,
        revokedAt: IsNull(),
        expiresAt: MoreThan(now),
      },
    });
    if (!session) {
      throw new UnauthorizedException();
    }

    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }

    return this.users.toPublicUser(user);
  }

  // ---------------------------------------------
  // Revogação de todas as sessões do usuário
  // ---------------------------------------------
  revokeAllWithManager(
    manager: EntityManager,
    userId: string,
    now: Date,
  ): Promise<unknown> {
    return manager.update(
      AuthSession,
      { userId, revokedAt: IsNull() },
      { revokedAt: now },
    );
  }

  // ---------------------------------------------
  // Revogação interna de uma família de tokens
  // ---------------------------------------------
  private async revokeWithManager(
    manager: EntityManager,
    session: AuthSession,
    now: Date,
  ): Promise<void> {
    if (!session.revokedAt) {
      session.revokedAt = now;
      await manager.save(session);
    }
    await manager.update(
      RefreshToken,
      { sessionId: session.id, revokedAt: IsNull() },
      { revokedAt: now },
    );
  }

  // ---------------------------------------------
  // Emissão do access token para a sessão persistida
  // ---------------------------------------------
  async complete(persisted: PersistedSession): Promise<AuthenticatedSession> {
    const accessToken = await this.accessTokens.issue(
      persisted.user.id,
      persisted.sessionId,
    );
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: this.users.toPublicUser(persisted.user),
      refreshToken: persisted.refreshToken,
      refreshExpiresAt: persisted.refreshExpiresAt,
    };
  }
}
