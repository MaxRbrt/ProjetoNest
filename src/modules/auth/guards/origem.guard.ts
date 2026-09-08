import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class GuardaDeOrigem implements CanActivate {
  private readonly isProduction: boolean;
  private readonly allowedOrigin: string;

  constructor(config: ConfigService) {
    this.isProduction = config.getOrThrow<string>('NODE_ENV') === 'production';
    this.allowedOrigin = new URL(
      config.getOrThrow<string>('FRONTEND_URL'),
    ).origin;
  }

  // ---------------------------------------------
  // Validação da origem em ambiente de produção
  // ---------------------------------------------
  canActivate(context: ExecutionContext): boolean {
    if (!this.isProduction) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    if (request.headers.origin !== this.allowedOrigin) {
      throw new ForbiddenException('Origem da requisição não autorizada.');
    }

    return true;
  }
}
