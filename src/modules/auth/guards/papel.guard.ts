import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PAPEIS_KEY } from '../../../decorators/papeis.decorator';
import { Papel } from '../../usuarios/usuario.entity';
import { UsuarioPublico } from '../../usuarios/usuarios.service';

@Injectable()
export class GuardaDePapel implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  // ---------------------------------------------
  // Verificação do papel exigido
  // Executado depois do guard de autenticação, portanto a requisição já
  // contém user nas rotas protegidas. Sem @Papeis(), nenhum papel é exigido.
  // A mensagem lista os papéis que @Papeis() pediu, em vez de citar ADMIN
  // fixo: assim continua correta quando um papel novo entrar no enum.
  // ---------------------------------------------
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Papel[] | undefined>(
      PAPEIS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: UsuarioPublico }>();
    if (!request.user || !required.includes(request.user.papel)) {
      throw new ForbiddenException(`Acesso restrito a ${required.join(', ')}.`);
    }
    return true;
  }
}
