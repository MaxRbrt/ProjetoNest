import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PublicUser } from '../modules/usuarios/users.service';

// ---------------------------------------------
// Usuário autenticado da requisição
// ---------------------------------------------
// O JwtStrategy grava o PublicUser em request.user após validar token e sessão.
// Só é seguro usar em rota protegida — em rota pública, request.user é undefined.
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PublicUser => {
    const request = context.switchToHttp().getRequest<{ user: PublicUser }>();
    return request.user;
  },
);
