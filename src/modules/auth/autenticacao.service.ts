import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { EmailDeAutenticacaoService } from '../email/email-de-autenticacao.service';
import { Usuario } from '../usuarios/usuario.entity';
import {
  ACCOUNT_LOCK_MS,
  GENERIC_ACCEPTED_RESPONSE,
  MAX_FAILED_LOGIN_ATTEMPTS,
} from './autenticacao.constants';
import { EsqueciSenhaDto } from './dto/esqueci-senha.dto';
import { EntrarDto } from './dto/entrar.dto';
import { CadastrarDto } from './dto/cadastrar.dto';
import { ReenviarVerificacaoDto } from './dto/reenviar-verificacao.dto';
import { RedefinirSenhaDto } from './dto/redefinir-senha.dto';
import { VerificarEmailDto } from './dto/verificar-email.dto';
import {
  TokensDeAcaoService,
  TokenDeAcaoEmitido,
} from './services/tokens-de-acao.service';
import { SenhaService } from './services/senha.service';
import {
  SessaoAutenticada,
  SessaoPersistida,
  SessoesService,
} from './services/sessoes.service';

const INVALID_CREDENTIALS = 'Email ou senha inválidos.';

interface EmailJob extends TokenDeAcaoEmitido {
  recipient: string;
}

type LoginResult =
  | { status: 'missing' | 'locked' | 'unauthorized' }
  | { status: 'unverified'; job: EmailJob | null }
  | { status: 'authenticated'; persisted: SessaoPersistida };

type PgDriverError = Error & { code?: string; constraint?: string };

@Injectable()
export class AutenticacaoService {
  private readonly logger = new Logger(AutenticacaoService.name);
  private readonly minimumResponseMs: number;

  constructor(
    @InjectRepository(Usuario)
    private readonly repositorioDeUsuarios: Repository<Usuario>,
    private readonly passwords: SenhaService,
    private readonly actionTokens: TokensDeAcaoService,
    private readonly sessions: SessoesService,
    private readonly email: EmailDeAutenticacaoService,
    config: ConfigService,
  ) {
    this.minimumResponseMs = config.getOrThrow<number>('AUTH_MIN_RESPONSE_MS');
  }

  // ---------------------------------------------
  // Cadastro de usuário
  // O Argon2 roda antes da transação para não manter bloqueios durante uma
  // operação deliberadamente cara de CPU e memória. A restrição única resolve
  // a corrida entre cadastros simultâneos: nesse caso o fluxo reaproveita a
  // resposta genérica, sem revelar que a conta já existe.
  // ---------------------------------------------
  async register(
    dto: CadastrarDto,
    now = new Date(),
  ): Promise<typeof GENERIC_ACCEPTED_RESPONSE> {
    const startedAt = Date.now();
    const passwordHash = await this.passwords.hash(dto.senha);
    let job: EmailJob | null;

    try {
      job = await this.repositorioDeUsuarios.manager.transaction((manager) =>
        this.prepareRegistration(manager, dto.email, passwordHash, now),
      );
    } catch (error) {
      if (!this.isEmailUniqueViolation(error)) {
        throw error;
      }
      job = await this.repositorioDeUsuarios.manager.transaction((manager) =>
        this.prepareExistingVerification(manager, dto.email, now),
      );
    }

    if (job) {
      await this.sendVerification(job);
    }
    await this.completeAtLeast(startedAt);
    return GENERIC_ACCEPTED_RESPONSE;
  }

  // ---------------------------------------------
  // Reenvio e confirmação de email
  // ---------------------------------------------
  async reenviarVerificacao(
    dto: ReenviarVerificacaoDto,
    now = new Date(),
  ): Promise<typeof GENERIC_ACCEPTED_RESPONSE> {
    const startedAt = Date.now();
    const job = await this.repositorioDeUsuarios.manager.transaction(
      (manager) => this.prepareExistingVerification(manager, dto.email, now),
    );
    if (job) {
      await this.sendVerification(job);
    }
    await this.completeAtLeast(startedAt);
    return GENERIC_ACCEPTED_RESPONSE;
  }

  verificarEmail(dto: VerificarEmailDto, now = new Date()): Promise<void> {
    return this.actionTokens.verificarEmail(dto.token, now);
  }

  // ---------------------------------------------
  // Login e emissão de sessão
  // O bloqueio serializa tentativas concorrentes para que a contagem de falhas
  // e o bloqueio temporário não percam atualizações. Todo caminho de falha é
  // igualado no tempo: conta inexistente ou bloqueada ainda executa Argon2
  // contra um hash falso, para aproximar o custo do caminho de uma conta real.
  // Senha correta com conta não verificada responde o mesmo 401 genérico —
  // não vazar que a senha estava certa —, e por isso a verificação é reenviada
  // aqui, senão o usuário legítimo ficaria sem saída; esse reenvio sai fora do
  // caminho de resposta, sem await, para não criar diferença de tempo
  // observável entre "senha certa, não verificado" e "senha errada".
  // ---------------------------------------------
  async login(dto: EntrarDto, now = new Date()): Promise<SessaoAutenticada> {
    const startedAt = Date.now();
    const result = await this.repositorioDeUsuarios.manager.transaction(
      async (manager): Promise<LoginResult> => {
        const usuario = await manager.findOne(Usuario, {
          where: { email: dto.email },
          select: {
            id: true,
            email: true,
            hashDaSenha: true,
            emailVerificadoEm: true,
            tentativasDeLoginFalhas: true,
            bloqueadoAte: true,
            criadoEm: true,
            atualizadoEm: true,
            papel: true,
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (!usuario) {
          return { status: 'missing' };
        }

        if (
          usuario.bloqueadoAte &&
          usuario.bloqueadoAte.getTime() > now.getTime()
        ) {
          return { status: 'locked' };
        }
        if (usuario.bloqueadoAte) {
          usuario.bloqueadoAte = null;
          usuario.tentativasDeLoginFalhas = 0;
        }

        let validPassword = false;
        try {
          validPassword = await this.passwords.verify(
            usuario.hashDaSenha,
            dto.senha,
          );
        } catch {
          this.logger.error(
            `Falha ao validar credencial do usuário ${usuario.id}`,
          );
        }

        if (!validPassword) {
          usuario.tentativasDeLoginFalhas += 1;
          if (usuario.tentativasDeLoginFalhas >= MAX_FAILED_LOGIN_ATTEMPTS) {
            usuario.bloqueadoAte = new Date(now.getTime() + ACCOUNT_LOCK_MS);
          }
          await manager.save(usuario);
          return { status: 'unauthorized' };
        }

        usuario.tentativasDeLoginFalhas = 0;
        usuario.bloqueadoAte = null;
        await manager.save(usuario);
        if (!usuario.emailVerificadoEm) {
          const job = await this.issueVerificationForUser(
            manager,
            usuario,
            now,
          );
          return { status: 'unverified', job };
        }

        const persisted = await this.sessions.criarComGerenciador(
          manager,
          usuario,
          now,
        );
        return { status: 'authenticated', persisted };
      },
    );

    if (result.status === 'missing' || result.status === 'locked') {
      await this.passwords.verificarFalsa(dto.senha);
    }
    await this.completeAtLeast(startedAt);

    if (result.status === 'unverified') {
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

  // ---------------------------------------------
  // Renovação e encerramento de sessão
  // ---------------------------------------------
  refresh(rawToken: string, now = new Date()): Promise<SessaoAutenticada> {
    return this.sessions.refresh(rawToken, now);
  }

  logout(rawToken: string | undefined, now = new Date()): Promise<void> {
    return this.sessions.logout(rawToken, now);
  }

  // ---------------------------------------------
  // Recuperação de senha
  // ---------------------------------------------
  async esqueciSenha(
    dto: EsqueciSenhaDto,
    now = new Date(),
  ): Promise<typeof GENERIC_ACCEPTED_RESPONSE> {
    const startedAt = Date.now();
    const job = await this.repositorioDeUsuarios.manager.transaction(
      async (manager): Promise<EmailJob | null> => {
        const usuario = await manager.findOne(Usuario, {
          where: { email: dto.email },
          lock: { mode: 'pessimistic_write' },
        });
        if (!usuario?.emailVerificadoEm) {
          return null;
        }
        const issued = await this.actionTokens.emitirRedefinicaoDeSenha(
          manager,
          usuario.id,
          now,
        );
        return issued ? { ...issued, recipient: usuario.email } : null;
      },
    );

    if (job) {
      await this.enviarRedefinicaoDeSenha(job);
    }
    await this.completeAtLeast(startedAt);
    return GENERIC_ACCEPTED_RESPONSE;
  }

  // ---------------------------------------------
  // Redefinição de senha
  // A nova senha é validada e derivada antes de consumir o token: uma senha
  // rejeitada ainda permite outra tentativa com o mesmo link, em vez de
  // queimar o token e obrigar o usuário a pedir outro email.
  // ---------------------------------------------
  async redefinirSenha(
    dto: RedefinirSenhaDto,
    now = new Date(),
  ): Promise<void> {
    const passwordHash = await this.passwords.hash(dto.novaSenha);
    await this.actionTokens.redefinirSenha(dto.token, passwordHash, now);
  }

  // ---------------------------------------------
  // Preparação de cadastro e verificação
  // ---------------------------------------------
  private async prepareRegistration(
    manager: EntityManager,
    email: string,
    passwordHash: string,
    now: Date,
  ): Promise<EmailJob | null> {
    const existing = await manager.findOne(Usuario, {
      where: { email },
      lock: { mode: 'pessimistic_write' },
    });
    if (existing) {
      return this.issueVerificationForUser(manager, existing, now);
    }

    const usuario = manager.create(Usuario, {
      email,
      hashDaSenha: passwordHash,
      emailVerificadoEm: null,
      tentativasDeLoginFalhas: 0,
      bloqueadoAte: null,
    });
    await manager.save(usuario);
    return this.issueVerificationForUser(manager, usuario, now);
  }

  private async prepareExistingVerification(
    manager: EntityManager,
    email: string,
    now: Date,
  ): Promise<EmailJob | null> {
    const usuario = await manager.findOne(Usuario, {
      where: { email },
      lock: { mode: 'pessimistic_write' },
    });
    return usuario
      ? this.issueVerificationForUser(manager, usuario, now)
      : null;
  }

  private async issueVerificationForUser(
    manager: EntityManager,
    usuario: Usuario,
    now: Date,
  ): Promise<EmailJob | null> {
    if (usuario.emailVerificadoEm) {
      return null;
    }
    const issued = await this.actionTokens.emitirVerificacaoDeEmail(
      manager,
      usuario.id,
      now,
    );
    return issued ? { ...issued, recipient: usuario.email } : null;
  }

  // ---------------------------------------------
  // Envio de emails de autenticação
  // ---------------------------------------------
  private async sendVerification(job: EmailJob): Promise<void> {
    try {
      await this.email.enviarVerificacaoDeEmail({
        recipient: job.recipient,
        rawToken: job.rawToken,
        actionTokenId: job.actionTokenId,
      });
    } catch {
      this.logger.warn(`Falha no envio de verificação ${job.actionTokenId}`);
    }
  }

  private async enviarRedefinicaoDeSenha(job: EmailJob): Promise<void> {
    try {
      await this.email.enviarRedefinicaoDeSenha({
        recipient: job.recipient,
        rawToken: job.rawToken,
        actionTokenId: job.actionTokenId,
      });
    } catch {
      this.logger.warn(`Falha no envio de reset ${job.actionTokenId}`);
    }
  }

  // ---------------------------------------------
  // Uniformização temporal das respostas
  // ---------------------------------------------
  private async completeAtLeast(startedAt: number): Promise<void> {
    const remaining = this.minimumResponseMs - (Date.now() - startedAt);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }

  // ---------------------------------------------
  // Identificação de conflito de email
  // ---------------------------------------------
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
