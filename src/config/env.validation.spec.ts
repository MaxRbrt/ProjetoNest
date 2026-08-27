import { validateEnvironment } from './env.validation';

const validEnvironment = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/app',
  JWT_SECRET: 'a'.repeat(32),
  JWT_ISSUER: 'projeto-test-api',
  JWT_AUDIENCE: 'projeto-test-frontend',
  RESEND_API_KEY: 're_test_key',
  EMAIL_FROM: 'Marketplace <onboarding@resend.dev>',
  FRONTEND_URL: 'http://localhost:3001',
};

describe('validateEnvironment', () => {
  it('aceita uma configuração de desenvolvimento válida e aplica defaults', () => {
    expect(validateEnvironment(validEnvironment)).toEqual(
      expect.objectContaining({
        NODE_ENV: 'development',
        HIBP_API_URL: 'https://api.pwnedpasswords.com',
        HIBP_TIMEOUT_MS: 3000,
        AUTH_MIN_RESPONSE_MS: 500,
      }),
    );
  });

  it('rejeita campos obrigatórios ausentes em uma única mensagem', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'development' })).toThrow(
      /DATABASE_URL.*JWT_SECRET.*JWT_ISSUER.*JWT_AUDIENCE.*RESEND_API_KEY.*EMAIL_FROM.*FRONTEND_URL/s,
    );
  });

  it('rejeita segredo JWT menor que 256 bits', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, JWT_SECRET: 'curto' }),
    ).toThrow('JWT_SECRET deve ter pelo menos 32 bytes');
  });

  it('rejeita placeholders mesmo quando têm tamanho suficiente', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        JWT_SECRET: 'replace-with-at-least-32-random-bytes',
        RESEND_API_KEY: 're_placeholder',
      }),
    ).toThrow(/JWT_SECRET.*RESEND_API_KEY/s);
  });

  it('exige HTTPS para o frontend em produção', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, NODE_ENV: 'production' }),
    ).toThrow('FRONTEND_URL deve usar HTTPS em produção');
  });

  it('rejeita números de segurança fora do intervalo', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        HIBP_TIMEOUT_MS: '0',
        AUTH_MIN_RESPONSE_MS: '-1',
      }),
    ).toThrow(/HIBP_TIMEOUT_MS.*AUTH_MIN_RESPONSE_MS/s);
  });
});
