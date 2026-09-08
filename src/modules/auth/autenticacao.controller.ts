import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { hours, minutes, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Publico } from '../../decorators/publico.decorator';
import type { UsuarioPublico } from '../usuarios/usuarios.service';
import { REFRESH_COOKIE_NAME } from './autenticacao.constants';
import { AutenticacaoService } from './autenticacao.service';
import { EsqueciSenhaDto } from './dto/esqueci-senha.dto';
import { EntrarDto } from './dto/entrar.dto';
import { CadastrarDto } from './dto/cadastrar.dto';
import { ReenviarVerificacaoDto } from './dto/reenviar-verificacao.dto';
import { RedefinirSenhaDto } from './dto/redefinir-senha.dto';
import { VerificarEmailDto } from './dto/verificar-email.dto';
import { GuardaDeOrigem } from './guards/origem.guard';
import { InterceptadorNoStore } from './no-store.interceptor';
import { CookieDeRenovacaoService } from './services/cookie-de-renovacao.service';
import type { SessaoAutenticada } from './services/sessoes.service';

interface AuthResponse {
  tokenDeAcesso: string;
  tipoDoToken: 'Bearer';
  expiraEm: number;
  usuario: UsuarioPublico;
}

interface RequisicaoAutenticada extends Request {
  user: UsuarioPublico;
}

@Controller('auth')
@UseInterceptors(InterceptadorNoStore)
export class AutenticacaoController {
  constructor(
    private readonly auth: AutenticacaoService,
    private readonly refreshCookies: CookieDeRenovacaoService,
  ) {}

  // ---------------------------------------------
  // Cadastro de usuário
  // ---------------------------------------------
  @Publico()
  @Post('register')
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: minutes(15) } })
  register(@Body() dto: CadastrarDto) {
    return this.auth.register(dto);
  }

  // ---------------------------------------------
  // Verificação de email
  // ---------------------------------------------
  @Publico()
  @Post('verify-email')
  @HttpCode(204)
  verificarEmail(@Body() dto: VerificarEmailDto): Promise<void> {
    return this.auth.verificarEmail(dto);
  }

  // ---------------------------------------------
  // Reenvio de verificação de email
  // ---------------------------------------------
  @Publico()
  @Post('resend-verification')
  @HttpCode(202)
  @Throttle({ default: { limit: 3, ttl: hours(1) } })
  reenviarVerificacao(@Body() dto: ReenviarVerificacaoDto) {
    return this.auth.reenviarVerificacao(dto);
  }

  // ---------------------------------------------
  // Login e emissão de sessão
  // ---------------------------------------------
  @Publico()
  @Post('login')
  @HttpCode(200)
  @UseGuards(GuardaDeOrigem)
  @Throttle({ default: { limit: 10, ttl: minutes(1) } })
  async login(
    @Body() dto: EntrarDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const sessao = await this.auth.login(dto);
    this.setRefreshCookie(response, sessao);
    return this.toResponse(sessao);
  }

  // ---------------------------------------------
  // Rotação de refresh token
  // ---------------------------------------------
  @Publico()
  @Post('refresh')
  @HttpCode(200)
  @UseGuards(GuardaDeOrigem)
  @Throttle({ default: { limit: 30, ttl: minutes(1) } })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const rawToken = this.readRefreshCookie(request);
    if (!rawToken) {
      this.refreshCookies.clear(response);
      throw new UnauthorizedException('Não foi possível renovar a sessão.');
    }

    try {
      const sessao = await this.auth.refresh(rawToken);
      this.setRefreshCookie(response, sessao);
      return this.toResponse(sessao);
    } catch (error) {
      this.refreshCookies.clear(response);
      throw error;
    }
  }

  // ---------------------------------------------
  // Encerramento de sessão
  // ---------------------------------------------
  @Publico()
  @Post('logout')
  @HttpCode(204)
  @UseGuards(GuardaDeOrigem)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(this.readRefreshCookie(request));
    this.refreshCookies.clear(response);
  }

  // ---------------------------------------------
  // Consulta do usuário autenticado
  // ---------------------------------------------
  @Get('me')
  me(@Req() request: RequisicaoAutenticada): UsuarioPublico {
    return request.user;
  }

  // ---------------------------------------------
  // Recuperação de senha
  // ---------------------------------------------
  @Publico()
  @Post('forgot-password')
  @HttpCode(202)
  @Throttle({ default: { limit: 3, ttl: hours(1) } })
  esqueciSenha(@Body() dto: EsqueciSenhaDto) {
    return this.auth.esqueciSenha(dto);
  }

  @Publico()
  @Post('reset-password')
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: minutes(1) } })
  redefinirSenha(@Body() dto: RedefinirSenhaDto): Promise<void> {
    return this.auth.redefinirSenha(dto);
  }

  // ---------------------------------------------
  // Transporte seguro do refresh token
  // ---------------------------------------------
  private readRefreshCookie(request: Request): string | undefined {
    const value: unknown = request.cookies?.[REFRESH_COOKIE_NAME];
    return typeof value === 'string' ? value : undefined;
  }

  private setRefreshCookie(
    response: Response,
    sessao: SessaoAutenticada,
  ): void {
    this.refreshCookies.set(
      response,
      sessao.tokenDeRenovacao,
      sessao.renovacaoExpiraEm,
    );
  }

  private toResponse(sessao: SessaoAutenticada): AuthResponse {
    return {
      tokenDeAcesso: sessao.tokenDeAcesso,
      tipoDoToken: sessao.tipoDoToken,
      expiraEm: sessao.expiraEm,
      usuario: sessao.usuario,
    };
  }
}
