import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CookieOptions, Response } from 'express';
import { REFRESH_COOKIE_NAME } from '../auth.constants';

@Injectable()
export class RefreshCookieService {
  private readonly secure: boolean;

  constructor(config: ConfigService) {
    this.secure = config.getOrThrow<string>('NODE_ENV') !== 'development';
  }

  // ---------------------------------------------
  // Gravação do refresh token em cookie
  // ---------------------------------------------
  set(
    response: Response,
    rawToken: string,
    expiresAt: Date,
    now = new Date(),
  ): void {
    response.cookie(REFRESH_COOKIE_NAME, rawToken, {
      ...this.options(),
      maxAge: Math.max(0, expiresAt.getTime() - now.getTime()),
    });
  }

  // ---------------------------------------------
  // Remoção do cookie de sessão
  // ---------------------------------------------
  clear(response: Response): void {
    response.clearCookie(REFRESH_COOKIE_NAME, this.options());
  }

  // ---------------------------------------------
  // Escopo e proteções do cookie
  // ---------------------------------------------
  private options(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.secure,
      sameSite: 'strict',
      path: '/auth',
    };
  }
}
