import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const context = {
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;

  // ---------------------------------------------
  // Comportamento de rotas públicas e protegidas
  // ---------------------------------------------
  it('libera rota marcada como pública sem validar token', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    } as unknown as Reflector;

    expect(new JwtAuthGuard(reflector).canActivate(context)).toBe(true);
  });

  it('delega para a estratégia JWT quando a rota não é pública', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);
    const parent = jest
      .spyOn(
        Object.getPrototypeOf(Object.getPrototypeOf(guard)) as {
          canActivate: () => boolean;
        },
        'canActivate',
      )
      .mockReturnValue(true);

    expect(guard.canActivate(context)).toBe(true);
    expect(parent).toHaveBeenCalledWith(context);
    parent.mockRestore();
  });
});
