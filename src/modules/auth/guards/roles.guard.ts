import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../../decorators/roles.decorator';
import { Role } from '../../usuarios/entities/user.entity';
import { PublicUser } from '../../usuarios/users.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  // ---------------------------------------------
  // Verificação do papel exigido
  // Executado depois do guard de autenticação, portanto a requisição já
  // contém user nas rotas protegidas. Sem @Roles(), nenhum papel é exigido.
  // A mensagem lista os papéis que @Roles() pediu, em vez de citar ADMIN
  // fixo: assim continua correta quando um papel novo entrar no enum.
  // ---------------------------------------------
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: PublicUser }>();
    if (!request.user || !required.includes(request.user.role)) {
      throw new ForbiddenException(`Acesso restrito a ${required.join(', ')}.`);
    }
    return true;
  }
}
