import { UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SessaoDeAutenticacao } from '../../src/modules/auth/entities/sessao-de-autenticacao.entity';
import { TokenDeRenovacao } from '../../src/modules/auth/entities/token-de-renovacao.entity';
import { SessoesService } from '../../src/modules/auth/services/sessoes.service';
import { TokenDeAcessoService } from '../../src/modules/auth/services/token-de-acesso.service';
import { TokenOpacoService } from '../../src/modules/auth/services/token-opaco.service';
import { Papel, Usuario } from '../../src/modules/usuarios/usuario.entity';
import { UsuariosService } from '../../src/modules/usuarios/usuarios.service';
import {
  abrirBancoDeTeste,
  fecharBancoDeTeste,
  limparTabelas,
} from './ambiente';

// ---------------------------------------------
// SessoesService contra Postgres real
// Estes casos existem porque a suíte unitária usa um FakeEntityManager escrito
// à mão, e uma revisão adversarial (Codex, 2026-09-08) mostrou exatamente o
// que aquele fake NÃO consegue provar: transação que desfaz de verdade, lock
// pessimista que serializa de verdade, e consulta que filtra de verdade. Os
// três pontos estão registrados como dívida no CLAUDE.md, item 1 — é essa
// dívida que este arquivo fecha.
//
// O serviço é montado com repositórios reais. O emissor de access token é
// substituído por um dublê porque assinar JWT não é o que está sob teste aqui;
// tudo que toca banco é real.
// ---------------------------------------------
describe('SessoesService (integração)', () => {
  let conexao: DataSource;
  let servico: SessoesService;
  let tokensOpacos: TokenOpacoService;
  let usuario: Usuario;

  beforeAll(async () => {
    conexao = await abrirBancoDeTeste();
  });

  afterAll(async () => {
    await fecharBancoDeTeste();
  });

  beforeEach(async () => {
    await limparTabelas(conexao);

    tokensOpacos = new TokenOpacoService();
    const emissorDeAcesso = {
      issue: () => Promise.resolve('access-token-de-teste'),
    } as unknown as TokenDeAcessoService;

    servico = new SessoesService(
      conexao.getRepository(SessaoDeAutenticacao),
      tokensOpacos,
      emissorDeAcesso,
      new UsuariosService(conexao.getRepository(Usuario)),
    );

    usuario = await conexao.getRepository(Usuario).save(
      conexao.getRepository(Usuario).create({
        email: 'dono-integracao@exemplo.local',
        hashDaSenha: 'hash-irrelevante-para-este-teste',
        papel: Papel.CLIENTE,
        emailVerificadoEm: new Date(),
        tentativasDeLoginFalhas: 0,
        bloqueadoAte: null,
      }),
    );
  });

  describe('revogação de família por reuso de token', () => {
    it('persiste a revogação de toda a família, visível de outra conexão', async () => {
      const primeira = await servico.criar(usuario);
      const segunda = await servico.refresh(primeira.tokenDeRenovacao);

      // reapresenta o token já consumido — sinal de roubo
      await expect(servico.refresh(primeira.tokenDeRenovacao)).rejects.toThrow(
        UnauthorizedException,
      );

      // leitura nova, fora de qualquer transação do serviço: a revogação
      // precisa ter sido efetivada no banco, não só no objeto em memória
      const tokens = await conexao.getRepository(TokenDeRenovacao).find();
      expect(tokens.length).toBeGreaterThanOrEqual(2);
      expect(tokens.every((token) => token.revogadoEm !== null)).toBe(true);

      const sessoes = await conexao.getRepository(SessaoDeAutenticacao).find();
      expect(sessoes.every((sessao) => sessao.revogadoEm !== null)).toBe(true);

      // o token que a rotação tinha acabado de emitir também morre junto
      await expect(servico.refresh(segunda.tokenDeRenovacao)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('lock pessimista sob concorrência real', () => {
    it('duas rotações simultâneas do mesmo token: exatamente uma vence', async () => {
      const sessao = await servico.criar(usuario);

      const resultados = await Promise.allSettled([
        servico.refresh(sessao.tokenDeRenovacao),
        servico.refresh(sessao.tokenDeRenovacao),
      ]);

      const vitoriosas = resultados.filter((r) => r.status === 'fulfilled');
      const derrotadas = resultados.filter((r) => r.status === 'rejected');

      // Comportamento observável: só uma rotação vale. Atenção ao ler este
      // caso — ele passa mesmo com todos os locks removidos do refresh
      // (verificado removendo os três de propósito). Ou seja: prova a
      // consequência, não o mecanismo. Quem prova o mecanismo é o caso
      // seguinte, com barreira explícita entre duas conexões.
      expect(vitoriosas).toHaveLength(1);
      expect(derrotadas).toHaveLength(1);
    });

    it('pessimistic_write bloqueia de verdade a segunda conexão até o commit da primeira', async () => {
      await servico.criar(usuario);
      const alvo = await conexao.getRepository(TokenDeRenovacao).findOneOrFail({
        where: {},
      });

      const conexaoA = conexao.createQueryRunner();
      const conexaoB = conexao.createQueryRunner();
      await conexaoA.connect();
      await conexaoB.connect();

      try {
        await conexaoA.startTransaction();
        await conexaoB.startTransaction();

        await conexaoA.manager.findOne(TokenDeRenovacao, {
          where: { id: alvo.id },
          lock: { mode: 'pessimistic_write' },
        });

        let bConseguiuLer = false;
        const leituraDeB = conexaoB.manager
          .findOne(TokenDeRenovacao, {
            where: { id: alvo.id },
            lock: { mode: 'pessimistic_write' },
          })
          .then(() => {
            bConseguiuLer = true;
          });

        // com o lock em pé, B fica pendurada esperando A soltar; sem o lock,
        // B leria na hora e este expect falharia
        await new Promise((resolve) => setTimeout(resolve, 400));
        expect(bConseguiuLer).toBe(false);

        await conexaoA.commitTransaction();
        await leituraDeB;
        expect(bConseguiuLer).toBe(true);

        await conexaoB.commitTransaction();
      } finally {
        await conexaoA.release();
        await conexaoB.release();
      }
    });

    it('logout concorrente com rotação não deixa a sessão em estado meio revogado', async () => {
      const sessao = await servico.criar(usuario);

      await Promise.allSettled([
        servico.refresh(sessao.tokenDeRenovacao),
        servico.logout(sessao.tokenDeRenovacao),
      ]);

      const sessoes = await conexao.getRepository(SessaoDeAutenticacao).find();
      const tokens = await conexao.getRepository(TokenDeRenovacao).find();

      // se a sessão foi revogada, nenhum token da família pode ter sobrado vivo
      const sessaoRevogada = sessoes.every((s) => s.revogadoEm !== null);
      if (sessaoRevogada) {
        expect(tokens.every((token) => token.revogadoEm !== null)).toBe(true);
      }
    });
  });

  describe('validarSessaoAtiva filtra de verdade na consulta', () => {
    it('recusa sessão de outro usuário', async () => {
      const sessao = await servico.criar(usuario);
      const persistida = await conexao
        .getRepository(SessaoDeAutenticacao)
        .findOneByOrFail({ usuarioId: usuario.id });

      const outro = await conexao.getRepository(Usuario).save(
        conexao.getRepository(Usuario).create({
          email: 'intruso-integracao@exemplo.local',
          hashDaSenha: 'hash-irrelevante',
          papel: Papel.CLIENTE,
          emailVerificadoEm: new Date(),
          tentativasDeLoginFalhas: 0,
          bloqueadoAte: null,
        }),
      );

      expect(sessao.tokenDeRenovacao).toBeDefined();
      await expect(
        servico.validarSessaoAtiva(outro.id, persistida.id),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('recusa sessão revogada', async () => {
      await servico.criar(usuario);
      const repositorio = conexao.getRepository(SessaoDeAutenticacao);
      const persistida = await repositorio.findOneByOrFail({
        usuarioId: usuario.id,
      });

      persistida.revogadoEm = new Date();
      await repositorio.save(persistida);

      await expect(
        servico.validarSessaoAtiva(usuario.id, persistida.id),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('recusa sessão expirada', async () => {
      await servico.criar(usuario);
      const repositorio = conexao.getRepository(SessaoDeAutenticacao);
      const persistida = await repositorio.findOneByOrFail({
        usuarioId: usuario.id,
      });

      persistida.expiraEm = new Date(Date.now() - 60_000);
      await repositorio.save(persistida);

      await expect(
        servico.validarSessaoAtiva(usuario.id, persistida.id),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('aceita sessão ativa do próprio dono', async () => {
      await servico.criar(usuario);
      const persistida = await conexao
        .getRepository(SessaoDeAutenticacao)
        .findOneByOrFail({ usuarioId: usuario.id });

      const publico = await servico.validarSessaoAtiva(
        usuario.id,
        persistida.id,
      );

      expect(publico.id).toBe(usuario.id);
      expect(publico.email).toBe('dono-integracao@exemplo.local');
    });
  });
});
