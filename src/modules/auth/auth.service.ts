import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { AuthEmailService } from '../email/email.service';
import { User } from '../users/entities/user.entity';
import {
  ACCOUNT_LOCK_MS,
  GENERIC_ACCEPTED_RESPONSE,
  MAX_FAILED_LOGIN_ATTEMPTS,
} from './auth.constants';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import {
  ActionTokensService,
  IssuedActionToken,
} from './services/action-tokens.service';
import { PasswordService } from './services/password.service';
import {
  AuthenticatedSession,
  PersistedSession,
  SessionsService,
} from './services/sessions.service';

const INVALID_CREDENTIALS = 'Email ou senha inválidos.';

interface EmailJob extends IssuedActionToken {
  recipient: string;
}

type LoginResult =
  | { status: 'missing' | 'locked' | 'unauthorized' }
  | { status: 'unverified'; job: EmailJob | null }
  | { status: 'authenticated'; persisted: PersistedSession };

type PgDriverError = Error & { code?: string; constraint?: string };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly minimumResponseMs: number;

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly passwords: PasswordService,
    private readonly actionTokens: ActionTokensService,
    private readonly sessions: SessionsService,
    private readonly email: AuthEmailService,
    config: ConfigService,
  ) {
    this.minimumResponseMs = config.getOrThrow<number>('AUTH_MIN_RESPONSE_MS');
  }

  async register(
    dto: RegisterDto,
    now = new Date(),
  ): Promise<typeof GENERIC_ACCEPTED_RESPONSE> {
    const startedAt = Date.now();
    const passwordHash = await this.passwords.hash(dto.password);
    let job: EmailJob | null;

    try {
      job = await this.usersRepository.manager.transaction((manager) =>
        this.prepareRegistration(manager, dto.email, passwordHash, now),
      );
    } catch (error) {
      if (!this.isEmailUniqueViolation(error)) {
        throw error;
      }
      job = await this.usersRepository.manager.transaction((manager) =>
        this.prepareExistingVerification(manager, dto.email, now),
      );
    }

    if (job) {
      await this.sendVerification(job);
    }
    await this.completeAtLeast(startedAt);
    return GENERIC_ACCEPTED_RESPONSE;
  }

  async resendVerification(
    dto: ResendVerificationDto,
    now = new Date(),
  ): Promise<typeof GENERIC_ACCEPTED_RESPONSE> {
    const startedAt = Date.now();
    const job = await this.usersRepository.manager.transaction((manager) =>
      this.prepareExistingVerification(manager, dto.email, now),
    );
    if (job) {
      await this.sendVerification(job);
    }
    await this.completeAtLeast(startedAt);
    return GENERIC_ACCEPTED_RESPONSE;
  }

  verifyEmail(dto: VerifyEmailDto, now = new Date()): Promise<void> {
    return this.actionTokens.verifyEmail(dto.token, now);
  }

  async login(dto: LoginDto, now = new Date()): Promise<AuthenticatedSession> {
    const startedAt = Date.now();
    const result = await this.usersRepository.manager.transaction(
      async (manager): Promise<LoginResult> => {
        const user = await manager.findOne(User, {
          where: { email: dto.email },
          select: {
            id: true,
            email: true,
            passwordHash: true,
            emailVerifiedAt: true,
            failedLoginAttempts: true,
            lockedUntil: true,
            createdAt: true,
            updatedAt: true,
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user) {
          return { status: 'missing' };
        }

        if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
          return { status: 'locked' };
        }
        if (user.lockedUntil) {
          user.lockedUntil = null;
          user.failedLoginAttempts = 0;
        }

        let validPassword = false;
        try {
          validPassword = await this.passwords.verify(
            user.passwordHash,
            dto.password,
          );
        } catch {
          this.logger.error(
            `Falha ao validar credencial do usuário ${user.id}`,
          );
        }

        if (!validPassword) {
          user.failedLoginAttempts += 1;
          if (user.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
            user.lockedUntil = new Date(now.getTime() + ACCOUNT_LOCK_MS);
          }
          await manager.save(user);
          return { status: 'unauthorized' };
        }

        user.failedLoginAttempts = 0;
        user.lockedUntil = null;
        await manager.save(user);
        if (!user.emailVerifiedAt) {
          // Senha correta, mas conta não verificada. A resposta HTTP é o mesmo
          // 401 genérico de senha errada (não vazar que a senha estava certa),
          // então reenviamos a verificação aqui para o usuário legítimo não
          // ficar sem saída — quem tem a senha certa recebe o email de novo.
          const job = await this.issueVerificationForUser(manager, user, now);
          return { status: 'unverified', job };
        }

        const persisted = await this.sessions.createWithManager(
          manager,
          user,
          now,
        );
        return { status: 'authenticated', persisted };
      },
    );

    if (result.status === 'missing' || result.status === 'locked') {
      await this.passwords.verifyDummy(dto.password);
    }
    await this.completeAtLeast(startedAt);

    if (result.status === 'unverified') {
      // Envio fora do caminho de resposta (sem await) para não introduzir
      // diferença de tempo observável entre "senha certa, não verificado"
      // e "senha errada".
      if (result.job) {
        void this.sendVerification(result.job);
      }
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (
      result.status === 'missing' ||
      result.status === 'locked' ||
      result.status === 'unauthorized'
    ) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (result.status !== 'authenticated') {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    return this.sessions.complete(result.persisted);
  }

  refresh(rawToken: string, now = new Date()): Promise<AuthenticatedSession> {
    return this.sessions.refresh(rawToken, now);
  }

  logout(rawToken: string | undefined, now = new Date()): Promise<void> {
    return this.sessions.logout(rawToken, now);
  }

  async forgotPassword(
    dto: ForgotPasswordDto,
    now = new Date(),
  ): Promise<typeof GENERIC_ACCEPTED_RESPONSE> {
    const startedAt = Date.now();
    const job = await this.usersRepository.manager.transaction(
      async (manager): Promise<EmailJob | null> => {
        const user = await manager.findOne(User, {
          where: { email: dto.email },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user?.emailVerifiedAt) {
          return null;
        }
        const issued = await this.actionTokens.issuePasswordReset(
          manager,
          user.id,
          now,
        );
        return issued ? { ...issued, recipient: user.email } : null;
      },
    );

    if (job) {
      await this.sendPasswordReset(job);
    }
    await this.completeAtLeast(startedAt);
    return GENERIC_ACCEPTED_RESPONSE;
  }

  async resetPassword(dto: ResetPasswordDto, now = new Date()): Promise<void> {
    const passwordHash = await this.passwords.hash(dto.newPassword);
    await this.actionTokens.resetPassword(dto.token, passwordHash, now);
  }

  private async prepareRegistration(
    manager: EntityManager,
    email: string,
    passwordHash: string,
    now: Date,
  ): Promise<EmailJob | null> {
    const existing = await manager.findOne(User, {
      where: { email },
      lock: { mode: 'pessimistic_write' },
    });
    if (existing) {
      return this.issueVerificationForUser(manager, existing, now);
    }

    const user = manager.create(User, {
      email,
      passwordHash,
      emailVerifiedAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
    await manager.save(user);
    return this.issueVerificationForUser(manager, user, now);
  }

  private async prepareExistingVerification(
    manager: EntityManager,
    email: string,
    now: Date,
  ): Promise<EmailJob | null> {
    const user = await manager.findOne(User, {
      where: { email },
      lock: { mode: 'pessimistic_write' },
    });
    return user ? this.issueVerificationForUser(manager, user, now) : null;
  }

  private async issueVerificationForUser(
    manager: EntityManager,
    user: User,
    now: Date,
  ): Promise<EmailJob | null> {
    if (user.emailVerifiedAt) {
      return null;
    }
    const issued = await this.actionTokens.issueEmailVerification(
      manager,
      user.id,
      now,
    );
    return issued ? { ...issued, recipient: user.email } : null;
  }

  private async sendVerification(job: EmailJob): Promise<void> {
    try {
      await this.email.sendEmailVerification({
        recipient: job.recipient,
        rawToken: job.rawToken,
        actionTokenId: job.actionTokenId,
      });
    } catch {
      this.logger.warn(`Falha no envio de verificação ${job.actionTokenId}`);
    }
  }

  private async sendPasswordReset(job: EmailJob): Promise<void> {
    try {
      await this.email.sendPasswordReset({
        recipient: job.recipient,
        rawToken: job.rawToken,
        actionTokenId: job.actionTokenId,
      });
    } catch {
      this.logger.warn(`Falha no envio de reset ${job.actionTokenId}`);
    }
  }

  private async completeAtLeast(startedAt: number): Promise<void> {
    const remaining = this.minimumResponseMs - (Date.now() - startedAt);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }

  private isEmailUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    const driverError = error.driverError as PgDriverError;
    return (
      driverError.code === '23505' &&
      driverError.constraint === 'UQ_users_email'
    );
  }
}
