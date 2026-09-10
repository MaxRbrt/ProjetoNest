import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { EmailDeAutenticacaoService } from '../email/email-de-autenticacao.service';
import { Usuario } from '../usuarios/usuario.entity';
import { AutenticacaoService } from './autenticacao.service';
import { SenhaService } from './services/senha.service';
import { SessoesService } from './services/sessoes.service';
import { TokensDeAcaoService } from './services/tokens-de-acao.service';

const MENSAGEM_GENERICA = 'Email ou senha inválidos.';

// ---------------------------------------------
// AutenticacaoService — login
// Cobre o invariante documentado em autenticacao.service.ts: conta
// inexistente, conta bloqueada, senha errada e email não verificado devem
// devolver exatamente a mesma exceção — nenhuma delas pode vazar qual
// situação é a real. Cobre também que completeAtLeast sempre agenda o
// preenchimento de tempo mínimo, mesmo no caminho mais rápido (conta
// inexistente).
// ---------------------------------------------
describe('AutenticacaoService — login', () => {
  let manager: { findOne: jest.Mock; save: jest.Mock };
  let repositorioDeUsuarios: {
    manager: { transaction: jest.Mock };
  };
  let passwords: {
    verify: jest.Mock;
    verificarFalsa: jest.Mock;
    hash: jest.Mock;
  };
  let actionTokens: { emitirVerificacaoDeEmail: jest.Mock };
  let sessions: { criarComGerenciador: jest.Mock; complete: jest.Mock };
  let email: { enviarVerificacaoDeEmail: jest.Mock };
  let servico: AutenticacaoService;

  const DTO = { email: 'dono@teste.com', senha: 'Senha-correta-1!' };

  function construirServico(minimumResponseMs = 0): AutenticacaoService {
    const config = {
      getOrThrow: jest.fn().mockReturnValue(minimumResponseMs),
    } as unknown as ConfigService;

    return new AutenticacaoService(
      repositorioDeUsuarios as unknown as Repository<Usuario>,
      passwords as unknown as SenhaService,
      actionTokens as unknown as TokensDeAcaoService,
      sessions as unknown as SessoesService,
      email as unknown as EmailDeAutenticacaoService,
      config,
    );
  }

  beforeEach(() => {
    manager = { findOne: jest.fn(), save: jest.fn((u) => Promise.resolve(u)) };
    repositorioDeUsuarios = {
      manager: { transaction: jest.fn((cb) => cb(manager)) },
    };
    passwords = {
      verify: jest.fn(),
      verificarFalsa: jest.fn().mockResolvedValue(false),
      hash: jest.fn(),
    };
    actionTokens = {
      emitirVerificacaoDeEmail: jest.fn().mockResolvedValue(null),
    };
    sessions = {
      criarComGerenciador: jest.fn(),
      complete: jest.fn(),
    };
    email = { enviarVerificacaoDeEmail: jest.fn().mockResolvedValue(undefined) };
    servico = construirServico();
  });

  function usuarioBase(overrides: Partial<Usuario> = {}): Usuario {
    return {
      id: randomUUID(),
      email: DTO.email,
      hashDaSenha: 'hash-qualquer',
      emailVerificadoEm: new Date('2026-01-01'),
      tentativasDeLoginFalhas: 0,
      bloqueadoAte: null,
      criadoEm: new Date('2026-01-01'),
      atualizadoEm: new Date('2026-01-01'),
      papel: 'CLIENTE',
      ...overrides,
    } as unknown as Usuario;
  }

  it('conta inexistente: exceção genérica e verificarFalsa chamado (equalização de tempo)', async () => {
    manager.findOne.mockResolvedValue(null);

    await expect(servico.login(DTO)).rejects.toThrow(
      new UnauthorizedException(MENSAGEM_GENERICA),
    );
    expect(passwords.verificarFalsa).toHaveBeenCalledWith(DTO.senha);
    expect(passwords.verify).not.toHaveBeenCalled();
  });

  it('conta bloqueada: mesma exceção genérica, byte a byte', async () => {
    const bloqueadoAte = new Date(Date.now() + 60_000);
    manager.findOne.mockResolvedValue(usuarioBase({ bloqueadoAte }));

    await expect(servico.login(DTO)).rejects.toThrow(
      new UnauthorizedException(MENSAGEM_GENERICA),
    );
    expect(passwords.verificarFalsa).toHaveBeenCalledWith(DTO.senha);
  });

  // ---------------------------------------------
  // Senha errada com usuário existente
  // Este caminho usa verify, não verificarFalsa (só usuário inexistente e
  // conta bloqueada usam a falsa), e precisa conferir contra o hash de fato
  // carregado do banco, não contra um valor qualquer.
  // ---------------------------------------------
  it('senha errada, usuário existente: mesma exceção genérica', async () => {
    const usuario = usuarioBase({ hashDaSenha: 'hash-real-do-usuario' });
    manager.findOne.mockResolvedValue(usuario);
    passwords.verify.mockResolvedValue(false);

    await expect(servico.login(DTO)).rejects.toThrow(
      new UnauthorizedException(MENSAGEM_GENERICA),
    );
    expect(passwords.verify).toHaveBeenCalledWith(
      'hash-real-do-usuario',
      DTO.senha,
    );
  });

  it('a busca do usuário seleciona explicitamente hashDaSenha (select: false na entidade)', async () => {
    manager.findOne.mockResolvedValue(null);

    await servico.login(DTO).catch(() => undefined);

    expect(manager.findOne).toHaveBeenCalledWith(
      Usuario,
      expect.objectContaining({
        select: expect.objectContaining({ hashDaSenha: true }),
      }),
    );
  });

  it('email não verificado, senha correta: mesma exceção genérica (não vazar que a senha estava certa)', async () => {
    manager.findOne.mockResolvedValue(
      usuarioBase({ emailVerificadoEm: null }),
    );
    passwords.verify.mockResolvedValue(true);

    await expect(servico.login(DTO)).rejects.toThrow(
      new UnauthorizedException(MENSAGEM_GENERICA),
    );
    expect(sessions.criarComGerenciador).not.toHaveBeenCalled();
  });

  it('happy path: credenciais corretas e email verificado devolve sessão, sem lançar', async () => {
    const usuario = usuarioBase();
    manager.findOne.mockResolvedValue(usuario);
    passwords.verify.mockResolvedValue(true);
    const persisted = { usuario, sessaoId: randomUUID() };
    sessions.criarComGerenciador.mockResolvedValue(persisted);
    const sessaoAutenticada = { tokenDeAcesso: 'token-fake' };
    sessions.complete.mockResolvedValue(sessaoAutenticada);

    await expect(servico.login(DTO)).resolves.toBe(sessaoAutenticada);
    expect(sessions.complete).toHaveBeenCalledWith(persisted);
  });

  // ---------------------------------------------
  // Tempo mínimo de resposta do login
  // Timers falsos de verdade, não um spy que executa o callback na hora: um
  // spy assim provaria só que setTimeout foi chamado, não que o login
  // realmente esperou — o tipo de teste tautológico apontado pela revisão
  // adversarial desta suíte. O primeiro avanço de 0ms existe para deixar os
  // microtasks da transação e da verificação falsa resolverem antes de o
  // setTimeout entrar em cena.
  // ---------------------------------------------
  it('completeAtLeast mantém a promessa pendente até o mínimo configurado e só resolve/rejeita depois', async () => {
    jest.useFakeTimers();
    try {
      servico = construirServico(200);
      manager.findOne.mockResolvedValue(null);

      let concluiu = false;
      void servico.login(DTO).catch(() => {
        concluiu = true;
      });

      await jest.advanceTimersByTimeAsync(0);
      expect(concluiu).toBe(false);

      await jest.advanceTimersByTimeAsync(199);
      expect(concluiu).toBe(false);

      await jest.advanceTimersByTimeAsync(1);
      expect(concluiu).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
