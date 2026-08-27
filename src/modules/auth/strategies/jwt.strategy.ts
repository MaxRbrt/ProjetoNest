import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { isUUID } from 'class-validator';
import { PublicUser } from '../../users/users.service';
import { SessionsService } from '../services/sessions.service';

interface AccessTokenPayload {
  sub?: unknown;
  sid?: unknown;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly sessions: SessionsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      algorithms: ['HS256'],
      issuer: config.getOrThrow<string>('JWT_ISSUER'),
      audience: config.getOrThrow<string>('JWT_AUDIENCE'),
      ignoreExpiration: false,
    });
  }

  validate(payload: AccessTokenPayload): Promise<PublicUser> {
    if (
      typeof payload?.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      !isUUID(payload.sub) ||
      !isUUID(payload.sid)
    ) {
      throw new UnauthorizedException();
    }
    return this.sessions.validateActiveSession(payload.sub, payload.sid);
  }
}
