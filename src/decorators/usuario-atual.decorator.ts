import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UsuarioPublico } from '../modules/usuarios/usuarios.service';

// ---------------------------------------------
// Usuário autenticado da requisição
// O EstrategiaJwt grava o UsuarioPublico em request.user após validar token e sessão.
// Só é seguro usar em rota protegida — em rota pública, request.user é undefined.
// ---------------------------------------------
export const UsuarioAtual = createParamDecorator(
  (_data: unknown, context: ExecutionContext): UsuarioPublico => {
    const request = context
      .switchToHttp()
      .getRequest<{ user: UsuarioPublico }>();
    return request.user;
  },
);
