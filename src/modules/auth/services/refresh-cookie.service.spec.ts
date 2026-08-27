import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { RefreshCookieService } from './refresh-cookie.service';

function createService(nodeEnvironment: string): RefreshCookieService {
  return new RefreshCookieService({
    getOrThrow: jest.fn().mockReturnValue(nodeEnvironment),
  } as unknown as ConfigService);
}

describe('RefreshCookieService', () => {
  it('define cookie host-only, HttpOnly, Strict e Secure em produção', () => {
    const response = { cookie: jest.fn() } as unknown as Response;
    const now = new Date('2026-08-26T12:00:00.000Z');
    const expiresAt = new Date('2026-09-25T12:00:00.000Z');

    createService('production').set(response, 'refresh-opaco', expiresAt, now);

    expect(response.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh-opaco',
      {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/auth',
        maxAge: expiresAt.getTime() - now.getTime(),
      },
    );
    expect((response.cookie as jest.Mock).mock.calls[0][2]).not.toHaveProperty(
      'domain',
    );
  });

  it('mantém Secure desligado somente no desenvolvimento', () => {
    const response = { cookie: jest.fn() } as unknown as Response;

    createService('development').set(
      response,
      'refresh-opaco',
      new Date('2026-08-27T12:00:00.000Z'),
      new Date('2026-08-26T12:00:00.000Z'),
    );

    expect(response.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh-opaco',
      expect.objectContaining({ secure: false }),
    );
  });

  it('limpa com as mesmas opções de escopo', () => {
    const response = { clearCookie: jest.fn() } as unknown as Response;

    createService('production').clear(response);

    expect(response.clearCookie).toHaveBeenCalledWith('refresh_token', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/auth',
    });
  });
});
