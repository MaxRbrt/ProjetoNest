import { UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { RefreshCookieService } from './services/refresh-cookie.service';
import { AuthenticatedSession } from './services/sessions.service';

describe('AuthController', () => {
  let auth: jest.Mocked<Pick<AuthService, 'login' | 'refresh' | 'logout'>>;
  let cookies: jest.Mocked<Pick<RefreshCookieService, 'set' | 'clear'>>;
  let controller: AuthController;
  let response: Response;
  const session: AuthenticatedSession = {
    accessToken: 'access-jwt',
    tokenType: 'Bearer',
    expiresIn: 900,
    user: {
      id: 'f2fa55e8-9bb4-4d42-8545-1ecae77bc327',
      email: 'usuario@example.com',
      isEmailVerified: true,
      createdAt: new Date('2026-08-26T12:00:00.000Z'),
    },
    refreshToken: 'A'.repeat(43),
    refreshExpiresAt: new Date('2026-09-25T12:00:00.000Z'),
  };

  beforeEach(() => {
    auth = {
      login: jest.fn().mockResolvedValue(session),
      refresh: jest.fn().mockResolvedValue(session),
      logout: jest.fn(),
    };
    cookies = { set: jest.fn(), clear: jest.fn() };
    controller = new AuthController(
      auth as AuthService,
      cookies as RefreshCookieService,
    );
    response = {} as Response;
  });

  it('login envia refresh só no cookie e o omite do JSON', async () => {
    const body = await controller.login(
      { email: 'usuario@example.com', password: 'frase senha segura' },
      response,
    );

    expect(cookies.set).toHaveBeenCalledWith(
      response,
      session.refreshToken,
      session.refreshExpiresAt,
    );
    expect(body).toEqual({
      accessToken: session.accessToken,
      tokenType: 'Bearer',
      expiresIn: 900,
      user: session.user,
    });
    expect(body).not.toHaveProperty('refreshToken');
    expect(body).not.toHaveProperty('refreshExpiresAt');
  });

  it('refresh lê somente o cookie HttpOnly e o rotaciona', async () => {
    const request = {
      cookies: { refresh_token: 'refresh-anterior' },
    } as unknown as Request;

    const body = await controller.refresh(request, response);

    expect(auth.refresh).toHaveBeenCalledWith('refresh-anterior');
    expect(cookies.set).toHaveBeenCalledWith(
      response,
      session.refreshToken,
      session.refreshExpiresAt,
    );
    expect(body.accessToken).toBe('access-jwt');
  });

  it('limpa o cookie quando refresh falha', async () => {
    auth.refresh.mockRejectedValue(new UnauthorizedException());
    const request = {
      cookies: { refresh_token: 'invalido' },
    } as unknown as Request;

    await expect(controller.refresh(request, response)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(cookies.clear).toHaveBeenCalledWith(response);
  });

  it('logout é idempotente inclusive sem cookie', async () => {
    const request = { cookies: {} } as Request;

    await controller.logout(request, response);

    expect(auth.logout).toHaveBeenCalledWith(undefined);
    expect(cookies.clear).toHaveBeenCalledWith(response);
  });
});
