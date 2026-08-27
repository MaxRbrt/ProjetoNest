import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../usuarios/entities/user.entity';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const contextComUsuario = (role?: Role) =>
    ({
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({
        getRequest: () => (role ? { user: { role } } : {}),
      }),
    }) as unknown as ExecutionContext;

  const reflectorCom = (roles: Role[] | undefined) =>
    ({
      getAllAndOverride: jest.fn().mockReturnValue(roles),
    }) as unknown as Reflector;

  it('libera rota sem exigência de papel', () => {
    const guard = new RolesGuard(reflectorCom(undefined));
    expect(guard.canActivate(contextComUsuario(Role.CLIENTE))).toBe(true);
  });

  it('libera quando o usuário tem o papel exigido', () => {
    const guard = new RolesGuard(reflectorCom([Role.ADMIN]));
    expect(guard.canActivate(contextComUsuario(Role.ADMIN))).toBe(true);
  });

  it('recusa quando o papel do usuário não basta', () => {
    const guard = new RolesGuard(reflectorCom([Role.ADMIN]));
    expect(() => guard.canActivate(contextComUsuario(Role.CLIENTE))).toThrow(
      ForbiddenException,
    );
  });

  it('recusa quando não há usuário na requisição', () => {
    const guard = new RolesGuard(reflectorCom([Role.ADMIN]));
    expect(() => guard.canActivate(contextComUsuario())).toThrow(
      ForbiddenException,
    );
  });
});
