import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from '../email/email.module';
import { User } from '../usuarios/entities/user.entity';
import { UsersModule } from '../usuarios/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthActionToken } from './entities/auth-action-token.entity';
import { AuthSession } from './entities/auth-session.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { OriginGuard } from './guards/origin.guard';
import { NoStoreInterceptor } from './interceptors/no-store.interceptor';
import { AccessTokenService } from './services/access-token.service';
import { ActionTokensService } from './services/action-tokens.service';
import { OpaqueTokenService } from './services/opaque-token.service';
import { PasswordService } from './services/password.service';
import { PwnedPasswordsService } from './services/pwned-passwords.service';
import { RefreshCookieService } from './services/refresh-cookie.service';
import { SessionsService } from './services/sessions.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  // ---------------------------------------------
  // Persistência e integrações da autenticação
  // ---------------------------------------------
  imports: [
    TypeOrmModule.forFeature([
      User,
      AuthSession,
      RefreshToken,
      AuthActionToken,
    ]),
    UsersModule,
    EmailModule,

    // ---------------------------------------------
    // Estratégia e configuração JWT
    // ---------------------------------------------
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          algorithm: 'HS256' as const,
          expiresIn: 900,
          issuer: config.getOrThrow<string>('JWT_ISSUER'),
          audience: config.getOrThrow<string>('JWT_AUDIENCE'),
        },
        verifyOptions: {
          algorithms: ['HS256' as const],
          issuer: config.getOrThrow<string>('JWT_ISSUER'),
          audience: config.getOrThrow<string>('JWT_AUDIENCE'),
        },
      }),
    }),
  ],

  // ---------------------------------------------
  // Casos de uso e fronteira HTTP
  // ---------------------------------------------
  controllers: [AuthController],
  providers: [
    AuthService,
    AccessTokenService,
    ActionTokensService,
    OpaqueTokenService,
    PasswordService,
    PwnedPasswordsService,
    RefreshCookieService,
    SessionsService,
    JwtStrategy,
    OriginGuard,
    NoStoreInterceptor,
  ],
})
export class AuthModule {}
