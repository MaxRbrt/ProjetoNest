import { UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityManager, Repository } from 'typeorm';
import { Usuario } from '../../usuarios/usuario.entity';
import { UsuariosService } from '../../usuarios/usuarios.service';
import { SessaoDeAutenticacao } from '../entities/sessao-de-autenticacao.entity';
import { TokenDeRenovacao } from '../entities/token-de-renovacao.entity';
import { TokenDeAcessoService } from './token-de-acesso.service';
import { TokenOpacoService } from './token-opaco.service';
import { SessoesService } from './sessoes.service';

// ---------------------------------------------
// Fake de EntityManager
// Simula só o suficiente do TypeORM (findOne/create/save/update/transaction)
// para exercitar a lógica de SessoesService sem banco real. Cada objeto que
// passa por create()/findOne()/semear() é registrado num WeakMap ligando o
// objeto ao seu tipo de entidade, porque save(entidade) no TypeORM real não
// recebe o tipo — ele é inferido da própria instância. O update() suporta
// apenas o que SessoesService usa: igualdade simples e o operador IsNull() do
// TypeORM (internamente um FindOperator com `_type: 'isNull'`).
// ---------------------------------------------
type Registro = Record<string, unknown> & { id: string };

class FakeEntityManager {
  private readonly tabelas = new Map<Function, Map<string, Registro>>();
  private readonly tipos = new WeakMap<object, Function>();

  private tabela(Entidade: Function): Map<string, Registro> {
    if (!this.tabelas.has(Entidade)) this.tabelas.set(Entidade, new Map());
    return this.tabelas.get(Entidade)!;
  }

  private registrar<T extends Registro>(objeto: T, Entidade: Function): T {
    this.tipos.set(objeto, Entidade);
    return objeto;
  }

  semear(Entidade: Function, registros: Registro[]): void {
    const mapa = this.tabela(Entidade);
    for (const registro of registros) {
      mapa.set(registro.id, this.registrar({ ...registro }, Entidade));
    }
  }

  obterTodos(Entidade: Function): Registro[] {
    return [...this.tabela(Entidade).values()];
  }

  findOne(
    Entidade: Function,
    opcoes: { where: Record<string, unknown> },
  ): Promise<Registro | null> {
    const linhas = this.tabela(Entidade);
    for (const linha of linhas.values()) {
      const bate = Object.entries(opcoes.where).every(
        ([chave, valor]) => linha[chave] === valor,
      );
      if (bate) return Promise.resolve(this.registrar({ ...linha }, Entidade));
    }
    return Promise.resolve(null);
  }

  create(Entidade: Function, dados: Record<string, unknown>): Registro {
    const objeto = { id: (dados.id as string) ?? randomUUID(), ...dados };
    return this.registrar(objeto, Entidade);
  }

  save(entidade: Registro): Promise<Registro> {
    const Entidade = this.tipos.get(entidade);
    if (!Entidade) {
      throw new Error(
        'Entidade desconhecida no FakeEntityManager.save — passe por create()/findOne() antes.',
      );
    }
    this.tabela(Entidade).set(entidade.id, { ...entidade });
    return Promise.resolve(entidade);
  }

  update(
    Entidade: Function,
    criterio: Record<string, unknown>,
    parcial: Record<string, unknown>,
  ): Promise<void> {
    const mapa = this.tabela(Entidade);
    for (const [id, linha] of mapa) {
      const bate = Object.entries(criterio).every(([chave, valor]) => {
        if (this.ehOperadorIsNull(valor)) return linha[chave] == null;
        return linha[chave] === valor;
      });
      if (bate) {
        mapa.set(id, { ...linha, ...parcial });
      }
    }
    return Promise.resolve();
  }

  private ehOperadorIsNull(valor: unknown): boolean {
    if (!valor || typeof valor !== 'object') return false;
    return (valor as { _type?: string })._type === 'isNull';
  }

  transaction<T>(
    trabalho: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return trabalho(this as unknown as EntityManager);
  }
}

// ---------------------------------------------
// SessoesService
// Cobre a rotação de refresh token (incluindo o caso de reuso — sinal de
// roubo, revoga a família inteira), o logout idempotente, a ordem de lock
// (usuário -> sessão -> refresh token, mesma ordem em toda operação) e a
// validação de sessão ativa usada pela EstrategiaJwt.
// ---------------------------------------------
describe('SessoesService', () => {
  const AGORA = new Date('2026-09-08T12:00:00.000Z');
  const NO_FUTURO = new Date('2026-10-08T12:00:00.000Z');
  const NO_PASSADO = new Date('2026-09-01T12:00:00.000Z');

  let manager: FakeEntityManager;
  let repositorioDeSessoes: { manager: FakeEntityManager; findOne: jest.Mock };
  let accessTokens: { issue: jest.Mock };
  let users: { buscarPorId: jest.Mock; paraUsuarioPublico: jest.Mock };
  let opaqueTokens: TokenOpacoService;
  let servico: SessoesService;

  const usuarioSeed = { id: randomUUID(), email: 'dono@teste.com' };

  beforeEach(() => {
    manager = new FakeEntityManager();
    repositorioDeSessoes = { manager, findOne: jest.fn() };
    accessTokens = { issue: jest.fn().mockResolvedValue('access-token-fake') };
    users = {
      buscarPorId: jest.fn(),
      paraUsuarioPublico: jest.fn((u: Usuario) => ({
        id: u.id,
        email: u.email,
      })),
    };
    opaqueTokens = new TokenOpacoService();

    servico = new SessoesService(
      repositorioDeSessoes as unknown as Repository<SessaoDeAutenticacao>,
      opaqueTokens,
      accessTokens as unknown as TokenDeAcessoService,
      users as unknown as UsuariosService,
    );

    manager.semear(Usuario, [usuarioSeed as unknown as Registro]);
  });

  function semearSessaoComToken(opcoes: {
    rawToken: string;
    sessaoExpiraEm: Date;
    sessaoRevogadoEm?: Date | null;
    tokenExpiraEm: Date;
    tokenUsadoEm?: Date | null;
    tokenRevogadoEm?: Date | null;
  }) {
    const sessaoId = randomUUID();
    manager.semear(SessaoDeAutenticacao, [
      {
        id: sessaoId,
        usuarioId: usuarioSeed.id,
        expiraEm: opcoes.sessaoExpiraEm,
        revogadoEm: opcoes.sessaoRevogadoEm ?? null,
        usadaPelaUltimaVezEm: NO_PASSADO,
      } as unknown as Registro,
    ]);
    const tokenId = randomUUID();
    manager.semear(TokenDeRenovacao, [
      {
        id: tokenId,
        sessaoId,
        hashDoToken: opaqueTokens.hash(opcoes.rawToken),
        expiraEm: opcoes.tokenExpiraEm,
        usadoEm: opcoes.tokenUsadoEm ?? null,
        revogadoEm: opcoes.tokenRevogadoEm ?? null,
        substituidoPeloTokenId: null,
      } as unknown as Registro,
    ]);
    return { sessaoId, tokenId };
  }

  describe('refresh — rotação válida', () => {
    it('gera novo token opaco e marca o antigo como usado', async () => {
      const rawToken = 'token-valido-original';
      const { sessaoId, tokenId } = semearSessaoComToken({
        rawToken,
        sessaoExpiraEm: NO_FUTURO,
        tokenExpiraEm: NO_FUTURO,
      });

      const resultado = await servico.refresh(rawToken, AGORA);

      expect(resultado.tokenDeRenovacao).not.toBe(rawToken);

      const tokens = manager.obterTodos(TokenDeRenovacao);
      const antigo = tokens.find((t) => t.id === tokenId)!;
      expect(antigo.usadoEm).toEqual(AGORA);
      expect(antigo.substituidoPeloTokenId).not.toBeNull();

      const novo = tokens.find((t) => t.id === antigo.substituidoPeloTokenId)!;
      expect(novo).toBeDefined();
      expect(novo.usadoEm).toBeNull();
      expect(novo.hashDoToken).toBe(opaqueTokens.hash(resultado.tokenDeRenovacao));

      const sessoes = manager.obterTodos(SessaoDeAutenticacao);
      const sessao = sessoes.find((s) => s.id === sessaoId)!;
      expect(sessao.usadaPelaUltimaVezEm).toEqual(AGORA);
      expect(sessao.revogadoEm).toBeNull();
    });
  });

  describe('refresh — reuso de token revoga a família inteira', () => {
    it('token já usado dispara revogação de toda a sessão, não só dele', async () => {
      const rawTokenReusado = 'token-ja-usado';
      const { sessaoId } = semearSessaoComToken({
        rawToken: rawTokenReusado,
        sessaoExpiraEm: NO_FUTURO,
        tokenExpiraEm: NO_FUTURO,
        tokenUsadoEm: NO_PASSADO, // já consumido antes — reapresentação = roubo
      });

      const rawTokenIrmao = 'token-irmao-ainda-valido';
      manager.semear(TokenDeRenovacao, [
        {
          id: randomUUID(),
          sessaoId,
          hashDoToken: opaqueTokens.hash(rawTokenIrmao),
          expiraEm: NO_FUTURO,
          usadoEm: null,
          revogadoEm: null,
          substituidoPeloTokenId: null,
        } as unknown as Registro,
      ]);

      await expect(servico.refresh(rawTokenReusado, AGORA)).rejects.toThrow(
        UnauthorizedException,
      );

      const sessao = manager
        .obterTodos(SessaoDeAutenticacao)
        .find((s) => s.id === sessaoId)!;
      expect(sessao.revogadoEm).toEqual(AGORA);

      const tokens = manager.obterTodos(TokenDeRenovacao);
      expect(tokens.every((t) => t.revogadoEm !== null)).toBe(true);

      await expect(servico.refresh(rawTokenIrmao, AGORA)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refresh — expiração e sessão revogada', () => {
    it('token expirado é inválido e revoga a sessão', async () => {
      const rawToken = 'token-expirado';
      semearSessaoComToken({
        rawToken,
        sessaoExpiraEm: NO_FUTURO,
        tokenExpiraEm: NO_PASSADO, // já expirado
      });

      await expect(servico.refresh(rawToken, AGORA)).rejects.toThrow(
        new UnauthorizedException('Não foi possível renovar a sessão.'),
      );
    });

    it('sessão expirada é inválida com a mesma mensagem', async () => {
      const rawToken = 'sessao-expirada';
      semearSessaoComToken({
        rawToken,
        sessaoExpiraEm: NO_PASSADO,
        tokenExpiraEm: NO_FUTURO,
      });

      await expect(servico.refresh(rawToken, AGORA)).rejects.toThrow(
        new UnauthorizedException('Não foi possível renovar a sessão.'),
      );
    });

    it('sessão já revogada é inválida com a mesma mensagem', async () => {
      const rawToken = 'sessao-ja-revogada';
      semearSessaoComToken({
        rawToken,
        sessaoExpiraEm: NO_FUTURO,
        sessaoRevogadoEm: NO_PASSADO,
        tokenExpiraEm: NO_FUTURO,
      });

      await expect(servico.refresh(rawToken, AGORA)).rejects.toThrow(
        new UnauthorizedException('Não foi possível renovar a sessão.'),
      );
    });

    it('token inexistente é inválido com a mesma mensagem (não distingue motivo)', async () => {
      await expect(servico.refresh('token-que-nunca-existiu', AGORA)).rejects.toThrow(
        new UnauthorizedException('Não foi possível renovar a sessão.'),
      );
    });
  });

  describe('logout — idempotente', () => {
    it('sem cookie, resolve sem lançar e sem efeito', async () => {
      await expect(servico.logout(undefined, AGORA)).resolves.toBeUndefined();
    });

    it('token inexistente, resolve sem lançar', async () => {
      await expect(
        servico.logout('token-que-nao-existe', AGORA),
      ).resolves.toBeUndefined();
    });

    it('chamar duas vezes com o mesmo token não lança na segunda vez', async () => {
      const rawToken = 'token-para-logout';
      const { sessaoId } = semearSessaoComToken({
        rawToken,
        sessaoExpiraEm: NO_FUTURO,
        tokenExpiraEm: NO_FUTURO,
      });

      await expect(servico.logout(rawToken, AGORA)).resolves.toBeUndefined();
      const sessao = manager
        .obterTodos(SessaoDeAutenticacao)
        .find((s) => s.id === sessaoId)!;
      expect(sessao.revogadoEm).toEqual(AGORA);

      await expect(servico.logout(rawToken, AGORA)).resolves.toBeUndefined();
    });
  });

  describe('ordem de lock', () => {
    it('refresh trava na ordem usuário -> sessão -> token', async () => {
      const rawToken = 'token-para-ordem-de-lock';
      semearSessaoComToken({
        rawToken,
        sessaoExpiraEm: NO_FUTURO,
        tokenExpiraEm: NO_FUTURO,
      });

      const chamadasComLock: Function[] = [];
      const findOneOriginal = manager.findOne.bind(manager);
      jest
        .spyOn(manager, 'findOne')
        .mockImplementation((Entidade, opcoes: any) => {
          if (opcoes.lock) chamadasComLock.push(Entidade);
          return findOneOriginal(Entidade, opcoes);
        });

      await servico.refresh(rawToken, AGORA);

      expect(chamadasComLock).toEqual([
        Usuario,
        SessaoDeAutenticacao,
        TokenDeRenovacao,
      ]);
    });

    it('logout trava na ordem sessão -> token', async () => {
      const rawToken = 'token-para-ordem-de-lock-logout';
      semearSessaoComToken({
        rawToken,
        sessaoExpiraEm: NO_FUTURO,
        tokenExpiraEm: NO_FUTURO,
      });

      const chamadasComLock: Function[] = [];
      const findOneOriginal = manager.findOne.bind(manager);
      jest
        .spyOn(manager, 'findOne')
        .mockImplementation((Entidade, opcoes: any) => {
          if (opcoes.lock) chamadasComLock.push(Entidade);
          return findOneOriginal(Entidade, opcoes);
        });

      await servico.logout(rawToken, AGORA);

      expect(chamadasComLock).toEqual([SessaoDeAutenticacao, TokenDeRenovacao]);
    });
  });

  describe('validarSessaoAtiva', () => {
    it('lança Unauthorized quando não há sessão ativa correspondente', async () => {
      repositorioDeSessoes.findOne.mockResolvedValue(null);

      await expect(
        servico.validarSessaoAtiva(usuarioSeed.id, randomUUID(), AGORA),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lança Unauthorized quando a sessão existe mas o usuário não existe mais', async () => {
      repositorioDeSessoes.findOne.mockResolvedValue({ id: randomUUID() });
      users.buscarPorId.mockResolvedValue(null);

      await expect(
        servico.validarSessaoAtiva(usuarioSeed.id, randomUUID(), AGORA),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('devolve o usuário público quando a sessão está ativa', async () => {
      repositorioDeSessoes.findOne.mockResolvedValue({ id: randomUUID() });
      users.buscarPorId.mockResolvedValue(usuarioSeed);

      const resultado = await servico.validarSessaoAtiva(
        usuarioSeed.id,
        randomUUID(),
        AGORA,
      );

      expect(users.paraUsuarioPublico).toHaveBeenCalledWith(usuarioSeed);
      expect(resultado).toEqual({ id: usuarioSeed.id, email: usuarioSeed.email });
    });
  });
});
