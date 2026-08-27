import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, MoreThan, Not, Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import {
  EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  VERIFICATION_COOLDOWN_MS,
} from '../auth.constants';
import {
  AuthActionToken,
  AuthActionTokenType,
} from '../entities/auth-action-token.entity';
import { OpaqueTokenService } from './opaque-token.service';
import { SessionsService } from './sessions.service';

const INVALID_ACTION_TOKEN = 'O token é inválido ou expirou.';

export interface IssuedActionToken {
  actionTokenId: string;
  rawToken: string;
  expiresAt: Date;
}

@Injectable()
export class ActionTokensService {
  constructor(
    @InjectRepository(AuthActionToken)
    private readonly actionTokensRepository: Repository<AuthActionToken>,
    private readonly opaqueTokens: OpaqueTokenService,
    private readonly sessions: SessionsService,
  ) {}

  // ---------------------------------------------
  // Emissão de token de verificação de email
  // ---------------------------------------------
  async issueEmailVerification(
    manager: EntityManager,
    userId: string,
    now: Date,
  ): Promise<IssuedActionToken | null> {
    // O lock serializa reenvios concorrentes para que o cooldown não seja
    // contornado por duas requisições simultâneas.
    const latest = await manager.findOne(AuthActionToken, {
      where: {
        userId,
        type: AuthActionTokenType.EMAIL_VERIFICATION,
        usedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      latest &&
      now.getTime() - latest.createdAt.getTime() < VERIFICATION_COOLDOWN_MS
    ) {
      return null;
    }

    await manager.update(
      AuthActionToken,
      {
        userId,
        type: AuthActionTokenType.EMAIL_VERIFICATION,
        usedAt: IsNull(),
      },
      { usedAt: now },
    );

    return this.createWithManager(
      manager,
      userId,
      AuthActionTokenType.EMAIL_VERIFICATION,
      EMAIL_VERIFICATION_TTL_MS,
      now,
    );
  }

  // ---------------------------------------------
  // Emissão de token de recuperação de senha
  // ---------------------------------------------
  async issuePasswordReset(
    manager: EntityManager,
    userId: string,
    now: Date,
  ): Promise<IssuedActionToken | null> {
    const active = await manager.findOne(AuthActionToken, {
      where: {
        userId,
        type: AuthActionTokenType.PASSWORD_RESET,
        usedAt: IsNull(),
        expiresAt: MoreThan(now),
      },
      order: { createdAt: 'DESC' },
      lock: { mode: 'pessimistic_write' },
    });
    if (active) {
      return null;
    }

    return this.createWithManager(
      manager,
      userId,
      AuthActionTokenType.PASSWORD_RESET,
      PASSWORD_RESET_TTL_MS,
      now,
    );
  }

  // ---------------------------------------------
  // Consumo de token de verificação de email
  // ---------------------------------------------
  verifyEmail(rawToken: string, now = new Date()): Promise<void> {
    return this.actionTokensRepository.manager.transaction(async (manager) => {
      const candidate = await this.findCandidate(
        manager,
        rawToken,
        AuthActionTokenType.EMAIL_VERIFICATION,
        now,
      );
      // A ordem usuário -> token é mantida nos fluxos de consumo para evitar
      // deadlocks quando duas ações da mesma conta concorrem.
      const user = await manager.findOne(User, {
        where: { id: candidate.action.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) {
        throw new BadRequestException(INVALID_ACTION_TOKEN);
      }
      // O candidato foi lido sem lock; a segunda leitura trava e revalida o
      // token para impedir uso duplo entre as duas consultas.
      const action = await this.lockForUse(
        manager,
        candidate,
        AuthActionTokenType.EMAIL_VERIFICATION,
        now,
      );

      user.emailVerifiedAt ??= now;
      action.usedAt = now;
      await manager.save(user);
      await manager.save(action);
      await manager.update(
        AuthActionToken,
        {
          userId: user.id,
          type: AuthActionTokenType.EMAIL_VERIFICATION,
          usedAt: IsNull(),
          id: Not(action.id),
        },
        { usedAt: now },
      );
    });
  }

  // ---------------------------------------------
  // Consumo de token e redefinição de senha
  // ---------------------------------------------
  resetPassword(
    rawToken: string,
    passwordHash: string,
    now = new Date(),
  ): Promise<void> {
    return this.actionTokensRepository.manager.transaction(async (manager) => {
      const candidate = await this.findCandidate(
        manager,
        rawToken,
        AuthActionTokenType.PASSWORD_RESET,
        now,
      );
      // Repete a ordem de locks do fluxo de verificação para que ações da
      // mesma conta não se bloqueiem em ordem inversa.
      const user = await manager.findOne(User, {
        where: { id: candidate.action.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) {
        throw new BadRequestException(INVALID_ACTION_TOKEN);
      }
      const action = await this.lockForUse(
        manager,
        candidate,
        AuthActionTokenType.PASSWORD_RESET,
        now,
      );

      user.passwordHash = passwordHash;
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
      action.usedAt = now;
      await manager.save(user);
      await manager.save(action);
      await manager.update(
        AuthActionToken,
        {
          userId: user.id,
          type: AuthActionTokenType.PASSWORD_RESET,
          usedAt: IsNull(),
          id: Not(action.id),
        },
        { usedAt: now },
      );
      await this.sessions.revokeAllWithManager(manager, user.id, now);
    });
  }

  // ---------------------------------------------
  // Persistência segura de tokens de ação
  // ---------------------------------------------
  private async createWithManager(
    manager: EntityManager,
    userId: string,
    type: AuthActionTokenType,
    ttlMs: number,
    now: Date,
  ): Promise<IssuedActionToken> {
    const opaque = this.opaqueTokens.generate();
    const expiresAt = new Date(now.getTime() + ttlMs);
    const action = manager.create(AuthActionToken, {
      userId,
      type,
      tokenHash: opaque.tokenHash,
      expiresAt,
      usedAt: null,
    });
    await manager.save(action);
    return {
      actionTokenId: action.id,
      rawToken: opaque.rawToken,
      expiresAt,
    };
  }

  // ---------------------------------------------
  // Busca, lock e validação para uso único
  // ---------------------------------------------
  private async findCandidate(
    manager: EntityManager,
    rawToken: string,
    type: AuthActionTokenType,
    now: Date,
  ): Promise<{ action: AuthActionToken; tokenHash: string }> {
    const tokenHash = this.opaqueTokens.hash(rawToken);
    const action = await manager.findOne(AuthActionToken, {
      where: { tokenHash },
    });
    this.assertUsable(action, type, now);
    return { action, tokenHash };
  }

  private async lockForUse(
    manager: EntityManager,
    candidate: { action: AuthActionToken; tokenHash: string },
    type: AuthActionTokenType,
    now: Date,
  ): Promise<AuthActionToken> {
    const action = await manager.findOne(AuthActionToken, {
      where: { id: candidate.action.id, tokenHash: candidate.tokenHash },
      lock: { mode: 'pessimistic_write' },
    });
    this.assertUsable(action, type, now);
    return action;
  }

  private assertUsable(
    action: AuthActionToken | null,
    type: AuthActionTokenType,
    now: Date,
  ): asserts action is AuthActionToken {
    if (
      !action ||
      action.type !== type ||
      action.usedAt ||
      action.expiresAt.getTime() <= now.getTime()
    ) {
      throw new BadRequestException(INVALID_ACTION_TOKEN);
    }
  }
}
