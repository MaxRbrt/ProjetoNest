import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, MoreThan, Not, Repository } from 'typeorm';
import { Usuario } from '../../usuarios/usuario.entity';
import {
  EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  VERIFICATION_COOLDOWN_MS,
} from '../autenticacao.constants';
import {
  TokenDeAcao,
  TipoDeTokenDeAcao,
} from '../entities/token-de-acao.entity';
import { TokenOpacoService } from './token-opaco.service';
import { SessoesService } from './sessoes.service';

const INVALID_ACTION_TOKEN = 'O token é inválido ou expirou.';

export interface TokenDeAcaoEmitido {
  actionTokenId: string;
  rawToken: string;
  expiraEm: Date;
}

@Injectable()
export class TokensDeAcaoService {
  constructor(
    @InjectRepository(TokenDeAcao)
    private readonly repositorioDeTokensDeAcao: Repository<TokenDeAcao>,
    private readonly opaqueTokens: TokenOpacoService,
    private readonly sessions: SessoesService,
  ) {}

  // ---------------------------------------------
  // Emissão de token de verificação de email
  // O bloqueio serializa reenvios concorrentes para que o intervalo mínimo
  // entre envios não seja contornado por duas requisições simultâneas.
  // ---------------------------------------------
  async emitirVerificacaoDeEmail(
    manager: EntityManager,
    usuarioId: string,
    now: Date,
  ): Promise<TokenDeAcaoEmitido | null> {
    const latest = await manager.findOne(TokenDeAcao, {
      where: {
        usuarioId,
        tipo: TipoDeTokenDeAcao.EMAIL_VERIFICATION,
        usadoEm: IsNull(),
      },
      order: { criadoEm: 'DESC' },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      latest &&
      now.getTime() - latest.criadoEm.getTime() < VERIFICATION_COOLDOWN_MS
    ) {
      return null;
    }

    await manager.update(
      TokenDeAcao,
      {
        usuarioId,
        tipo: TipoDeTokenDeAcao.EMAIL_VERIFICATION,
        usadoEm: IsNull(),
      },
      { usadoEm: now },
    );

    return this.criarComGerenciador(
      manager,
      usuarioId,
      TipoDeTokenDeAcao.EMAIL_VERIFICATION,
      EMAIL_VERIFICATION_TTL_MS,
      now,
    );
  }

  // ---------------------------------------------
  // Emissão de token de recuperação de senha
  // ---------------------------------------------
  async emitirRedefinicaoDeSenha(
    manager: EntityManager,
    usuarioId: string,
    now: Date,
  ): Promise<TokenDeAcaoEmitido | null> {
    const active = await manager.findOne(TokenDeAcao, {
      where: {
        usuarioId,
        tipo: TipoDeTokenDeAcao.PASSWORD_RESET,
        usadoEm: IsNull(),
        expiraEm: MoreThan(now),
      },
      order: { criadoEm: 'DESC' },
      lock: { mode: 'pessimistic_write' },
    });
    if (active) {
      return null;
    }

    return this.criarComGerenciador(
      manager,
      usuarioId,
      TipoDeTokenDeAcao.PASSWORD_RESET,
      PASSWORD_RESET_TTL_MS,
      now,
    );
  }

  // ---------------------------------------------
  // Consumo de token de verificação de email
  // A ordem de bloqueios é sempre usuário -> token, para evitar interbloqueio
  // quando duas ações da mesma conta concorrem. O candidato é lido sem
  // bloqueio; a segunda leitura trava e revalida o token, impedindo uso duplo
  // na janela entre as duas consultas.
  // ---------------------------------------------
  verificarEmail(rawToken: string, now = new Date()): Promise<void> {
    return this.repositorioDeTokensDeAcao.manager.transaction(
      async (manager) => {
        const candidate = await this.buscarCandidato(
          manager,
          rawToken,
          TipoDeTokenDeAcao.EMAIL_VERIFICATION,
          now,
        );
        const usuario = await manager.findOne(Usuario, {
          where: { id: candidate.action.usuarioId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!usuario) {
          throw new BadRequestException(INVALID_ACTION_TOKEN);
        }
        const action = await this.travarParaUso(
          manager,
          candidate,
          TipoDeTokenDeAcao.EMAIL_VERIFICATION,
          now,
        );

        usuario.emailVerificadoEm ??= now;
        action.usadoEm = now;
        await manager.save(usuario);
        await manager.save(action);
        await manager.update(
          TokenDeAcao,
          {
            usuarioId: usuario.id,
            tipo: TipoDeTokenDeAcao.EMAIL_VERIFICATION,
            usadoEm: IsNull(),
            id: Not(action.id),
          },
          { usadoEm: now },
        );
      },
    );
  }

  // ---------------------------------------------
  // Consumo de token e redefinição de senha
  // Repete a ordem de bloqueios do fluxo de verificação (usuário -> token)
  // para que ações da mesma conta nunca travem em ordem inversa.
  // ---------------------------------------------
  redefinirSenha(
    rawToken: string,
    passwordHash: string,
    now = new Date(),
  ): Promise<void> {
    return this.repositorioDeTokensDeAcao.manager.transaction(
      async (manager) => {
        const candidate = await this.buscarCandidato(
          manager,
          rawToken,
          TipoDeTokenDeAcao.PASSWORD_RESET,
          now,
        );
        const usuario = await manager.findOne(Usuario, {
          where: { id: candidate.action.usuarioId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!usuario) {
          throw new BadRequestException(INVALID_ACTION_TOKEN);
        }
        const action = await this.travarParaUso(
          manager,
          candidate,
          TipoDeTokenDeAcao.PASSWORD_RESET,
          now,
        );

        usuario.hashDaSenha = passwordHash;
        usuario.tentativasDeLoginFalhas = 0;
        usuario.bloqueadoAte = null;
        action.usadoEm = now;
        await manager.save(usuario);
        await manager.save(action);
        await manager.update(
          TokenDeAcao,
          {
            usuarioId: usuario.id,
            tipo: TipoDeTokenDeAcao.PASSWORD_RESET,
            usadoEm: IsNull(),
            id: Not(action.id),
          },
          { usadoEm: now },
        );
        await this.sessions.revogarTodasComGerenciador(
          manager,
          usuario.id,
          now,
        );
      },
    );
  }

  // ---------------------------------------------
  // Persistência segura de tokens de ação
  // ---------------------------------------------
  private async criarComGerenciador(
    manager: EntityManager,
    usuarioId: string,
    tipo: TipoDeTokenDeAcao,
    ttlMs: number,
    now: Date,
  ): Promise<TokenDeAcaoEmitido> {
    const opaque = this.opaqueTokens.generate();
    const expiraEm = new Date(now.getTime() + ttlMs);
    const action = manager.create(TokenDeAcao, {
      usuarioId,
      tipo,
      hashDoToken: opaque.hashDoToken,
      expiraEm,
      usadoEm: null,
    });
    await manager.save(action);
    return {
      actionTokenId: action.id,
      rawToken: opaque.rawToken,
      expiraEm,
    };
  }

  // ---------------------------------------------
  // Busca, bloqueio e validação para uso único
  // ---------------------------------------------
  private async buscarCandidato(
    manager: EntityManager,
    rawToken: string,
    tipo: TipoDeTokenDeAcao,
    now: Date,
  ): Promise<{ action: TokenDeAcao; hashDoToken: string }> {
    const hashDoToken = this.opaqueTokens.hash(rawToken);
    const action = await manager.findOne(TokenDeAcao, {
      where: { hashDoToken },
    });
    this.assertUsable(action, tipo, now);
    return { action, hashDoToken };
  }

  private async travarParaUso(
    manager: EntityManager,
    candidate: { action: TokenDeAcao; hashDoToken: string },
    tipo: TipoDeTokenDeAcao,
    now: Date,
  ): Promise<TokenDeAcao> {
    const action = await manager.findOne(TokenDeAcao, {
      where: { id: candidate.action.id, hashDoToken: candidate.hashDoToken },
      lock: { mode: 'pessimistic_write' },
    });
    this.assertUsable(action, tipo, now);
    return action;
  }

  private assertUsable(
    action: TokenDeAcao | null,
    tipo: TipoDeTokenDeAcao,
    now: Date,
  ): asserts action is TokenDeAcao {
    if (
      !action ||
      action.tipo !== tipo ||
      action.usadoEm ||
      action.expiraEm.getTime() <= now.getTime()
    ) {
      throw new BadRequestException(INVALID_ACTION_TOKEN);
    }
  }
}
