import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../decorators/public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const handler = () => undefined;
  const controllerClass = class {};
  const context = {
    getHandler: () => handler,
    getClass: () => controllerClass,
  } as unknown as ExecutionContext;

  // ---------------------------------------------
  // Comportamento de rotas públicas e protegidas
  // ---------------------------------------------
  it('libera rota marcada como pública sem validar token', () => {
    const getAllAndOverride = jest.fn().mockReturnValue(true);
    const reflector = { getAllAndOverride } as unknown as Reflector;

    expect(new JwtAuthGuard(reflector).canActivate(context)).toBe(true);
    // O alvo do lookup importa tanto quanto o retorno: consultar apenas o
    // handler ignoraria @Public() aplicado na classe do controller, e uma
    // chave errada devolveria undefined, protegendo rota que deveria ser
    // pública. Asserta a chave e os dois níveis consultados.
    expect(getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      handler,
      controllerClass,
    ]);
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
