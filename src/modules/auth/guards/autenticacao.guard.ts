import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { IS_PUBLICO_KEY } from '../../../decorators/publico.decorator';

@Injectable()
export class GuardaDeAutenticacao extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  // ---------------------------------------------
  // Liberação de rotas públicas
  // Sem @Publico(), a rota exige token. Um controller novo que esqueça a
  // anotação nasce protegido — falha fechada, ao contrário de guard por
  // controller, que deixaria a rota aberta silenciosamente.
  // ---------------------------------------------
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLICO_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }
}
