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
import type { PublicUser } from '../users/users.service';
import { REFRESH_COOKIE_NAME } from './auth.constants';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OriginGuard } from './guards/origin.guard';
import { NoStoreInterceptor } from './interceptors/no-store.interceptor';
import { RefreshCookieService } from './services/refresh-cookie.service';
import type { AuthenticatedSession } from './services/sessions.service';

interface AuthResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: PublicUser;
}

interface AuthenticatedRequest extends Request {
  user: PublicUser;
}

@Controller('auth')
@UseInterceptors(NoStoreInterceptor)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly refreshCookies: RefreshCookieService,
  ) {}

  @Post('register')
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: minutes(15) } })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('verify-email')
  @HttpCode(204)
  verifyEmail(@Body() dto: VerifyEmailDto): Promise<void> {
    return this.auth.verifyEmail(dto);
  }

  @Post('resend-verification')
  @HttpCode(202)
  @Throttle({ default: { limit: 3, ttl: hours(1) } })
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.auth.resendVerification(dto);
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(OriginGuard)
  @Throttle({ default: { limit: 10, ttl: minutes(1) } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const session = await this.auth.login(dto);
    this.setRefreshCookie(response, session);
    return this.toResponse(session);
  }

  @Post('refresh')
  @HttpCode(200)
  @UseGuards(OriginGuard)
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
      const session = await this.auth.refresh(rawToken);
      this.setRefreshCookie(response, session);
      return this.toResponse(session);
    } catch (error) {
      this.refreshCookies.clear(response);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(OriginGuard)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(this.readRefreshCookie(request));
    this.refreshCookies.clear(response);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() request: AuthenticatedRequest): PublicUser {
    return request.user;
  }

  @Post('forgot-password')
  @HttpCode(202)
  @Throttle({ default: { limit: 3, ttl: hours(1) } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: minutes(1) } })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.auth.resetPassword(dto);
  }

  private readRefreshCookie(request: Request): string | undefined {
    const value: unknown = request.cookies?.[REFRESH_COOKIE_NAME];
    return typeof value === 'string' ? value : undefined;
  }

  private setRefreshCookie(
    response: Response,
    session: AuthenticatedSession,
  ): void {
    this.refreshCookies.set(
      response,
      session.refreshToken,
      session.refreshExpiresAt,
    );
  }

  private toResponse(session: AuthenticatedSession): AuthResponse {
    return {
      accessToken: session.accessToken,
      tokenType: session.tokenType,
      expiresIn: session.expiresIn,
      user: session.user,
    };
  }
}
