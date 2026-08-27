import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { OriginGuard } from './origin.guard';

function contextWithOrigin(origin?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { origin } }) as Request,
    }),
  } as unknown as ExecutionContext;
}

function createGuard(nodeEnvironment: string): OriginGuard {
  const values: Record<string, string> = {
    NODE_ENV: nodeEnvironment,
    FRONTEND_URL: 'https://app.example.com/path',
  };
  return new OriginGuard({
    getOrThrow: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService);
}

describe('OriginGuard', () => {
  // ---------------------------------------------
  // Flexibilidade no ambiente de desenvolvimento
  // ---------------------------------------------
  it('não bloqueia ferramentas REST no desenvolvimento', () => {
    expect(createGuard('development').canActivate(contextWithOrigin())).toBe(
      true,
    );
  });

  // ---------------------------------------------
  // Validação estrita da origem em produção
  // ---------------------------------------------
  it('aceita somente a origem exata configurada em produção', () => {
    const guard = createGuard('production');

    expect(
      guard.canActivate(contextWithOrigin('https://app.example.com')),
    ).toBe(true);
    expect(() =>
      guard.canActivate(
        contextWithOrigin('https://app.example.com.attacker.tld'),
      ),
    ).toThrow(ForbiddenException);
  });

  it('falha fechada quando Origin está ausente em produção', () => {
    expect(() =>
      createGuard('production').canActivate(contextWithOrigin()),
    ).toThrow(ForbiddenException);
  });
});
