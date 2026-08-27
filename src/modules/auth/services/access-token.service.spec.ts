import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AccessTokenService } from './access-token.service';

describe('AccessTokenService', () => {
  const secret = 's'.repeat(32);
  const jwt = new JwtService({ secret });
  const config = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        JWT_SECRET: secret,
        JWT_ISSUER: 'projeto-test-api',
        JWT_AUDIENCE: 'projeto-test-frontend',
      };
      return values[key];
    }),
  } as unknown as ConfigService;
  const service = new AccessTokenService(jwt, config);

  it('emite HS256 por 15 minutos com sub, sid, issuer e audience', async () => {
    const accessToken = await service.issue(
      'f2fa55e8-9bb4-4d42-8545-1ecae77bc327',
      '4a76e6ec-61c1-497e-931a-e1e8f9c15331',
    );
    const payload = await jwt.verifyAsync<{
      sub: string;
      sid: string;
      iss: string;
      aud: string;
      iat: number;
      exp: number;
    }>(accessToken, {
      secret,
      algorithms: ['HS256'],
      issuer: 'projeto-test-api',
      audience: 'projeto-test-frontend',
    });

    expect(payload).toEqual(
      expect.objectContaining({
        sub: 'f2fa55e8-9bb4-4d42-8545-1ecae77bc327',
        sid: '4a76e6ec-61c1-497e-931a-e1e8f9c15331',
        iss: 'projeto-test-api',
        aud: 'projeto-test-frontend',
      }),
    );
    expect(payload.exp - payload.iat).toBe(900);
  });
});
