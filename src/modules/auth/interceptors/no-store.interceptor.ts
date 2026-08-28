import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';

@Injectable()
export class NoStoreInterceptor implements NestInterceptor {
  // ---------------------------------------------
  // Prevenção de cache nas respostas de autenticação
  // Respostas de autenticação podem conter credenciais ou dados sensíveis;
  // no-store impede que navegadores e intermediários as armazenem.
  // ---------------------------------------------
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader('Cache-Control', 'no-store');
    return next.handle();
  }
}
