import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PwnedPasswordsService } from './pwned-passwords.service';

describe('PwnedPasswordsService', () => {
  let service: PwnedPasswordsService;
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    const values: Record<string, unknown> = {
      HIBP_API_URL: 'https://api.pwnedpasswords.com',
      HIBP_TIMEOUT_MS: 3000,
    };
    const config = {
      getOrThrow: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;

    service = new PwnedPasswordsService(config);
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('envia só o prefixo SHA-1 e identifica senha comprometida', async () => {
    fetchMock.mockResolvedValue(
      new Response('1E4C9B93F3F0682250B6CF8331B7EE68FD8:3303003\nABC:0', {
        status: 200,
      }),
    );

    await expect(service.isCompromised('password')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.pwnedpasswords.com/range/5BAA6',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Add-Padding': 'true',
          'User-Agent': 'projeto-test-auth/1.0',
        }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('ignora linhas artificiais com contagem zero', async () => {
    fetchMock.mockResolvedValue(
      new Response('1E4C9B93F3F0682250B6CF8331B7EE68FD8:0', {
        status: 200,
      }),
    );

    await expect(service.isCompromised('password')).resolves.toBe(false);
  });

  it('falha fechada quando a API responde com erro', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }));

    await expect(service.isCompromised('password')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('falha fechada em erro de rede sem vazar o erro original', async () => {
    fetchMock.mockRejectedValue(new Error('mensagem externa sensível'));

    await expect(service.isCompromised('password')).rejects.toThrow(
      'A validação de senha está temporariamente indisponível.',
    );
  });
});
