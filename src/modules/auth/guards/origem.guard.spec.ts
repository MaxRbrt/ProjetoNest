import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GuardaDeOrigem } from './origem.guard';

// ---------------------------------------------
// GuardaDeOrigem
// isProduction e allowedOrigin são calculados no construtor, não por
// requisição — cada cenário de ambiente precisa da sua própria instância.
// ---------------------------------------------
describe('GuardaDeOrigem', () => {
  function configCom(nodeEnv: string, frontendUrl: string): ConfigService {
    return {
      getOrThrow: jest.fn((chave: string) => {
        if (chave === 'NODE_ENV') return nodeEnv;
        if (chave === 'FRONTEND_URL') return frontendUrl;
        throw new Error(`chave inesperada: ${chave}`);
      }),
    } as unknown as ConfigService;
  }

  function contextoComOrigem(origin: string | undefined): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { origin } }),
      }),
    } as unknown as ExecutionContext;
  }

  it('fora de produção, permite mesmo com origem arbitrária', () => {
    const guard = new GuardaDeOrigem(
      configCom('development', 'https://exemplo.com'),
    );
    expect(guard.canActivate(contextoComOrigem('https://outro.com'))).toBe(
      true,
    );
  });

  it('em produção, bloqueia origem diferente da configurada', () => {
    const guard = new GuardaDeOrigem(
      configCom('production', 'https://exemplo.com'),
    );
    expect(() =>
      guard.canActivate(contextoComOrigem('https://outro.com')),
    ).toThrow(ForbiddenException);
  });

  it('em produção, aceita a origem exatamente igual à configurada', () => {
    const guard = new GuardaDeOrigem(
      configCom('production', 'https://exemplo.com'),
    );
    expect(guard.canActivate(contextoComOrigem('https://exemplo.com'))).toBe(
      true,
    );
  });

  it('em produção, bloqueia quando a origem está ausente na requisição', () => {
    const guard = new GuardaDeOrigem(
      configCom('production', 'https://exemplo.com'),
    );
    expect(() => guard.canActivate(contextoComOrigem(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
