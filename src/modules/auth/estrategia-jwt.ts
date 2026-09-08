import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { isUUID } from 'class-validator';
import { UsuarioPublico } from '../usuarios/usuarios.service';
import { SessoesService } from './services/sessoes.service';

interface AccessTokenPayload {
  sub?: unknown;
  sid?: unknown;
}

@Injectable()
export class EstrategiaJwt extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly sessions: SessoesService,
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

  // ---------------------------------------------
  // Validação do token e da sessão ativa
  // ---------------------------------------------
  validate(payload: AccessTokenPayload): Promise<UsuarioPublico> {
    if (
      typeof payload?.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      !isUUID(payload.sub) ||
      !isUUID(payload.sid)
    ) {
      throw new UnauthorizedException();
    }
    return this.sessions.validarSessaoAtiva(payload.sub, payload.sid);
  }
}
