import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GuardaDePapel } from './papel.guard';

// ---------------------------------------------
// GuardaDePapel
// Cobertura direta da regressão real do CLAUDE.md: um rename varreu
// request.user -> request.usuario e quebrou toda rota protegida sem o tsc
// acusar (o retorno de getRequest<T>() "prova a si mesmo"). O teste central
// aqui é o Step 3 do plano: a mesma informação sob a chave errada precisa
// ser tratada como usuário ausente, e não aceita silenciosamente.
// ---------------------------------------------
describe('GuardaDePapel', () => {
  function contextoCom(request: unknown): ExecutionContext {
    return {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  function reflectorRetornando(papeis: string[] | undefined): Reflector {
    return {
      getAllAndOverride: jest.fn().mockReturnValue(papeis),
    } as unknown as Reflector;
  }

  it('sem @Papeis() na rota, permite qualquer requisição', () => {
    const guard = new GuardaDePapel(reflectorRetornando(undefined));
    expect(guard.canActivate(contextoCom({}))).toBe(true);
  });

  it('permite quando request.user.papel está na lista exigida', () => {
    const guard = new GuardaDePapel(reflectorRetornando(['ADMIN']));
    const request = { user: { papel: 'ADMIN' } };
    expect(guard.canActivate(contextoCom(request))).toBe(true);
  });

  it('nega quando request.user.papel não está na lista exigida', () => {
    const guard = new GuardaDePapel(reflectorRetornando(['ADMIN']));
    const request = { user: { papel: 'CLIENTE' } };
    expect(() => guard.canActivate(contextoCom(request))).toThrow(
      ForbiddenException,
    );
  });

  it('nega quando o usuário está sob a chave "usuario" em vez de "user" — regressão do rename PT-BR', () => {
    const guard = new GuardaDePapel(reflectorRetornando(['ADMIN']));
    const request = { usuario: { papel: 'ADMIN' } };
    expect(() => guard.canActivate(contextoCom(request))).toThrow(
      ForbiddenException,
    );
  });

  it('nega quando request.user está ausente', () => {
    const guard = new GuardaDePapel(reflectorRetornando(['ADMIN']));
    expect(() => guard.canActivate(contextoCom({}))).toThrow(
      ForbiddenException,
    );
  });
});
