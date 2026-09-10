import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { SenhasVazadasService } from './senhas-vazadas.service';

// ---------------------------------------------
// SenhasVazadasService
// Cobre o modelo de k-anonimato (só o prefixo do hash sai da aplicação) e,
// principalmente, o comportamento de falha fechada: é a peça que hoje
// sustenta a política de composição de senha (ver CLAUDE.md — "se a checagem
// HIBP for algum dia desativada, esta política fica frágil"). Os testes de
// URL/prefixo e de cancelamento por AbortSignal existem porque uma revisão
// adversarial (Codex) apontou que a primeira versão desta suíte usava um
// mock fixo que aceitaria, sem detectar, tanto o envio do hash completo (ou
// da senha) quanto a remoção do timeout — nenhum dos dois faria teste falhar.
// ---------------------------------------------
describe('SenhasVazadasService', () => {
  const HIBP_API_URL = 'https://api.hibp.test';

  function criarConfigMock(timeoutMs = 2_000): ConfigService {
    return {
      getOrThrow: jest.fn((chave: string) => {
        if (chave === 'HIBP_API_URL') return HIBP_API_URL;
        if (chave === 'HIBP_TIMEOUT_MS') return timeoutMs;
        throw new Error(`chave inesperada: ${chave}`);
      }),
    } as unknown as ConfigService;
  }

  function sufixoSha1(senha: string): {
    sha1: string;
    prefix: string;
    suffix: string;
  } {
    const sha1 = createHash('sha1')
      .update(senha, 'utf8')
      .digest('hex')
      .toUpperCase();
    return { sha1, prefix: sha1.slice(0, 5), suffix: sha1.slice(5) };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejeita (retorna true) quando o sufixo do hash aparece no range devolvido, enviando só o prefixo de 5 caracteres', async () => {
    const senha = 'senha-vazada-de-teste';
    const { sha1, prefix, suffix } = sufixoSha1(senha);
    const fetchEspiao = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(`OUTRO1:3\r\n${suffix}:9\r\n`),
    } as Response);

    const servico = new SenhasVazadasService(criarConfigMock());
    await expect(servico.estaComprometida(senha)).resolves.toBe(true);

    expect(fetchEspiao).toHaveBeenCalledTimes(1);
    const urlChamada = fetchEspiao.mock.calls[0][0] as string;
    expect(urlChamada).toBe(`${HIBP_API_URL}/range/${prefix}`);
    expect(urlChamada).not.toContain(sha1);
    expect(urlChamada).not.toContain(senha);
  });

  it('aceita (retorna false) quando o sufixo não aparece no range devolvido', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('OUTRO1:3\r\nOUTRO2:5\r\n'),
    } as Response);

    const servico = new SenhasVazadasService(criarConfigMock());
    await expect(
      servico.estaComprometida('senha-nunca-vazada'),
    ).resolves.toBe(false);
  });

  it('falha fechada (ServiceUnavailableException) quando a API HIBP responde erro HTTP', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      text: () => Promise.resolve(''),
    } as Response);

    const servico = new SenhasVazadasService(criarConfigMock());
    await expect(servico.estaComprometida('qualquer-senha')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  // ---------------------------------------------
  // Timeout da consulta ao HIBP
  // O mock só rejeita quando o `signal` recebido em opções realmente aborta,
  // não de forma incondicional. Isso prova que o serviço repassa um
  // AbortSignal funcional (via AbortSignal.timeout), e não apenas que o catch
  // genérico existe: se estaComprometida parasse de repassar o signal ao
  // fetch, a requisição ficaria pendurada para sempre e o teste travaria por
  // timeout do próprio Jest, em vez de passar.
  // ---------------------------------------------
  it('falha fechada quando a requisição nunca responde e o AbortSignal de timeout dispara', async () => {
    jest.spyOn(global, 'fetch').mockImplementation((_url, opcoes) => {
      const signal = (opcoes as RequestInit | undefined)?.signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () =>
          reject(new Error('requisição abortada por timeout')),
        );
      });
    });

    const servico = new SenhasVazadasService(criarConfigMock(10));
    await expect(servico.estaComprometida('qualquer-senha')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('falha fechada (ServiceUnavailableException) quando a chamada de rede rejeita por outro motivo', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('DNS falhou'));

    const servico = new SenhasVazadasService(criarConfigMock());
    await expect(servico.estaComprometida('qualquer-senha')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
