import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from '../email/email.module';
import { Usuario } from '../usuarios/usuario.entity';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { AutenticacaoController } from './autenticacao.controller';
import { AutenticacaoService } from './autenticacao.service';
import { TokenDeAcao } from './entities/token-de-acao.entity';
import { SessaoDeAutenticacao } from './entities/sessao-de-autenticacao.entity';
import { TokenDeRenovacao } from './entities/token-de-renovacao.entity';
import { GuardaDeOrigem } from './guards/origem.guard';
import { InterceptadorNoStore } from './no-store.interceptor';
import { TokenDeAcessoService } from './services/token-de-acesso.service';
import { TokensDeAcaoService } from './services/tokens-de-acao.service';
import { TokenOpacoService } from './services/token-opaco.service';
import { SenhaService } from './services/senha.service';
import { SenhasVazadasService } from './services/senhas-vazadas.service';
import { CookieDeRenovacaoService } from './services/cookie-de-renovacao.service';
import { SessoesService } from './services/sessoes.service';
import { EstrategiaJwt } from './estrategia-jwt';

@Module({
  // ---------------------------------------------
  // Persistência e integrações da autenticação
  // ---------------------------------------------
  imports: [
    TypeOrmModule.forFeature([
      Usuario,
      SessaoDeAutenticacao,
      TokenDeRenovacao,
      TokenDeAcao,
    ]),
    UsuariosModule,
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
  controllers: [AutenticacaoController],
  providers: [
    AutenticacaoService,
    TokenDeAcessoService,
    TokensDeAcaoService,
    TokenOpacoService,
    SenhaService,
    SenhasVazadasService,
    CookieDeRenovacaoService,
    SessoesService,
    EstrategiaJwt,
    GuardaDeOrigem,
    InterceptadorNoStore,
  ],
})
export class AutenticacaoModule {}
