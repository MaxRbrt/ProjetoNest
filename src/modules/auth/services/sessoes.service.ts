import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, MoreThan, Repository } from 'typeorm';
import { Usuario } from '../../usuarios/usuario.entity';
import {
  UsuarioPublico,
  UsuariosService,
} from '../../usuarios/usuarios.service';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  SESSION_TTL_MS,
} from '../autenticacao.constants';
import { SessaoDeAutenticacao } from '../entities/sessao-de-autenticacao.entity';
import { TokenDeRenovacao } from '../entities/token-de-renovacao.entity';
import { TokenDeAcessoService } from './token-de-acesso.service';
import { TokenOpacoService } from './token-opaco.service';

const INVALID_SESSION_MESSAGE = 'Não foi possível renovar a sessão.';

export interface SessaoAutenticada {
  tokenDeAcesso: string;
  tipoDoToken: 'Bearer';
  expiraEm: number;
  usuario: UsuarioPublico;
  tokenDeRenovacao: string;
  renovacaoExpiraEm: Date;
}

export interface SessaoPersistida {
  usuario: Usuario;
  sessaoId: string;
  tokenDeRenovacao: string;
  renovacaoExpiraEm: Date;
}

type RefreshTransactionResult =
  { status: 'invalid' } | ({ status: 'valid' } & SessaoPersistida);

@Injectable()
export class SessoesService {
  constructor(
    @InjectRepository(SessaoDeAutenticacao)
    private readonly repositorioDeSessoes: Repository<SessaoDeAutenticacao>,
    private readonly opaqueTokens: TokenOpacoService,
    private readonly accessTokens: TokenDeAcessoService,
    private readonly users: UsuariosService,
  ) {}

  // ---------------------------------------------
  // Criação de sessão
  // ---------------------------------------------
  async criar(usuario: Usuario, now = new Date()): Promise<SessaoAutenticada> {
    const persisted = await this.repositorioDeSessoes.manager.transaction(
      async (manager) => this.criarComGerenciador(manager, usuario, now),
    );
    return this.complete(persisted);
  }

  // ---------------------------------------------
  // Persistência da sessão e do refresh token
  // ---------------------------------------------
  async criarComGerenciador(
    manager: EntityManager,
    usuario: Usuario,
    now: Date,
  ): Promise<SessaoPersistida> {
    const refreshExpiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    const opaque = this.opaqueTokens.generate();
    const sessao = manager.create(SessaoDeAutenticacao, {
      usuarioId: usuario.id,
      expiraEm: refreshExpiresAt,
      revogadoEm: null,
      usadaPelaUltimaVezEm: now,
    });
    await manager.save(sessao);

    const refreshToken = manager.create(TokenDeRenovacao, {
      sessaoId: sessao.id,
      hashDoToken: opaque.hashDoToken,
      expiraEm: refreshExpiresAt,
      usadoEm: null,
      revogadoEm: null,
      substituidoPeloTokenId: null,
    });
    await manager.save(refreshToken);

    return {
      usuario,
      sessaoId: sessao.id,
      tokenDeRenovacao: opaque.rawToken,
      renovacaoExpiraEm: refreshExpiresAt,
    };
  }

  // ---------------------------------------------
  // Rotação de refresh token
  // Os bloqueios seguem sempre a ordem usuário -> sessão -> refresh token: uma
  // ordem única reduz o risco de interbloqueio com logout e troca de senha.
  // Token já usado ou revogado indica possível roubo, e nesse caso a família
  // inteira da sessão é revogada, não apenas o valor reapresentado.
  // ---------------------------------------------
  async refresh(
    rawToken: string,
    now = new Date(),
  ): Promise<SessaoAutenticada> {
    const hashDoToken = this.opaqueTokens.hash(rawToken);
    const result = await this.repositorioDeSessoes.manager.transaction(
      async (manager): Promise<RefreshTransactionResult> => {
        const tokenCandidate = await manager.findOne(TokenDeRenovacao, {
          where: { hashDoToken },
        });
        if (!tokenCandidate) {
          return { status: 'invalid' };
        }

        const sessionCandidate = await manager.findOne(SessaoDeAutenticacao, {
          where: { id: tokenCandidate.sessaoId },
        });
        if (!sessionCandidate) {
          return { status: 'invalid' };
        }

        const usuario = await manager.findOne(Usuario, {
          where: { id: sessionCandidate.usuarioId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!usuario) {
          return { status: 'invalid' };
        }

        const sessao = await manager.findOne(SessaoDeAutenticacao, {
          where: {
            id: sessionCandidate.id,
            usuarioId: usuario.id,
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (!sessao) {
          return { status: 'invalid' };
        }

        const current = await manager.findOne(TokenDeRenovacao, {
          where: {
            id: tokenCandidate.id,
            sessaoId: sessao.id,
            hashDoToken,
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (!current) {
          return { status: 'invalid' };
        }

        if (current.usadoEm || current.revogadoEm) {
          await this.revogarComGerenciador(manager, sessao, now);
          return { status: 'invalid' };
        }

        if (
          current.expiraEm.getTime() <= now.getTime() ||
          sessao.expiraEm.getTime() <= now.getTime() ||
          sessao.revogadoEm
        ) {
          current.revogadoEm ??= now;
          await manager.save(current);
          await this.revogarComGerenciador(manager, sessao, now);
          return { status: 'invalid' };
        }

        const nextOpaque = this.opaqueTokens.generate();
        const next = manager.create(TokenDeRenovacao, {
          sessaoId: sessao.id,
          hashDoToken: nextOpaque.hashDoToken,
          expiraEm: sessao.expiraEm,
          usadoEm: null,
          revogadoEm: null,
          substituidoPeloTokenId: null,
        });
        await manager.save(next);

        current.usadoEm = now;
        current.substituidoPeloTokenId = next.id;
        sessao.usadaPelaUltimaVezEm = now;
        await manager.save(current);
        await manager.save(sessao);

        return {
          status: 'valid',
          usuario,
          sessaoId: sessao.id,
          tokenDeRenovacao: nextOpaque.rawToken,
          renovacaoExpiraEm: sessao.expiraEm,
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
  // A sessão é travada antes do refresh token para preservar a mesma ordem de
  // bloqueios usada na rotação, evitando interbloqueio entre logout e refresh
  // concorrentes.
  // ---------------------------------------------
  async logout(rawToken: string | undefined, now = new Date()): Promise<void> {
    if (!rawToken) {
      return;
    }

    const hashDoToken = this.opaqueTokens.hash(rawToken);
    await this.repositorioDeSessoes.manager.transaction(async (manager) => {
      const candidate = await manager.findOne(TokenDeRenovacao, {
        where: { hashDoToken },
      });
      if (!candidate) {
        return;
      }

      const sessao = await manager.findOne(SessaoDeAutenticacao, {
        where: { id: candidate.sessaoId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sessao) {
        return;
      }

      const token = await manager.findOne(TokenDeRenovacao, {
        where: {
          id: candidate.id,
          sessaoId: sessao.id,
          hashDoToken,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!token) {
        return;
      }

      await this.revogarComGerenciador(manager, sessao, now);
    });
  }

  // ---------------------------------------------
  // Validação de sessão protegida
  // ---------------------------------------------
  async validarSessaoAtiva(
    usuarioId: string,
    sessaoId: string,
    now = new Date(),
  ): Promise<UsuarioPublico> {
    const sessao = await this.repositorioDeSessoes.findOne({
      where: {
        id: sessaoId,
        usuarioId,
        revogadoEm: IsNull(),
        expiraEm: MoreThan(now),
      },
    });
    if (!sessao) {
      throw new UnauthorizedException();
    }

    const usuario = await this.users.buscarPorId(usuarioId);
    if (!usuario) {
      throw new UnauthorizedException();
    }

    return this.users.paraUsuarioPublico(usuario);
  }

  // ---------------------------------------------
  // Revogação de todas as sessões do usuário
  // ---------------------------------------------
  revogarTodasComGerenciador(
    manager: EntityManager,
    usuarioId: string,
    now: Date,
  ): Promise<unknown> {
    return manager.update(
      SessaoDeAutenticacao,
      { usuarioId, revogadoEm: IsNull() },
      { revogadoEm: now },
    );
  }

  // ---------------------------------------------
  // Revogação interna de uma família de tokens
  // ---------------------------------------------
  private async revogarComGerenciador(
    manager: EntityManager,
    sessao: SessaoDeAutenticacao,
    now: Date,
  ): Promise<void> {
    if (!sessao.revogadoEm) {
      sessao.revogadoEm = now;
      await manager.save(sessao);
    }
    await manager.update(
      TokenDeRenovacao,
      { sessaoId: sessao.id, revogadoEm: IsNull() },
      { revogadoEm: now },
    );
  }

  // ---------------------------------------------
  // Emissão do access token para a sessão persistida
  // ---------------------------------------------
  async complete(persisted: SessaoPersistida): Promise<SessaoAutenticada> {
    const accessToken = await this.accessTokens.issue(
      persisted.usuario.id,
      persisted.sessaoId,
    );
    return {
      tokenDeAcesso: accessToken,
      tipoDoToken: 'Bearer',
      expiraEm: ACCESS_TOKEN_TTL_SECONDS,
      usuario: this.users.paraUsuarioPublico(persisted.usuario),
      tokenDeRenovacao: persisted.tokenDeRenovacao,
      renovacaoExpiraEm: persisted.renovacaoExpiraEm,
    };
  }
}
