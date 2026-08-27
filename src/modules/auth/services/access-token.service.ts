import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ACCESS_TOKEN_TTL_SECONDS } from '../auth.constants';

@Injectable()
export class AccessTokenService {
  private readonly secret: string;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>('JWT_SECRET');
    this.issuer = config.getOrThrow<string>('JWT_ISSUER');
    this.audience = config.getOrThrow<string>('JWT_AUDIENCE');
  }

  issue(userId: string, sessionId: string): Promise<string> {
    return this.jwt.signAsync(
      { sid: sessionId },
      {
        secret: this.secret,
        algorithm: 'HS256',
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        issuer: this.issuer,
        audience: this.audience,
        subject: userId,
      },
    );
  }
}
