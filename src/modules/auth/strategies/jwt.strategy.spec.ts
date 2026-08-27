import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionsService } from '../services/sessions.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const user = {
    id: 'f2fa55e8-9bb4-4d42-8545-1ecae77bc327',
    email: 'usuario@example.com',
    isEmailVerified: true,
    createdAt: new Date('2026-08-26T12:00:00.000Z'),
  };
  const sessions = {
    validateActiveSession: jest.fn().mockResolvedValue(user),
  } as unknown as SessionsService;
  const values: Record<string, string> = {
    JWT_SECRET: 's'.repeat(32),
    JWT_ISSUER: 'projeto-test-api',
    JWT_AUDIENCE: 'projeto-test-frontend',
  };
  const config = {
    getOrThrow: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
  const strategy = new JwtStrategy(config, sessions);

  // ---------------------------------------------
  // Cenários de validação do JWT
  // ---------------------------------------------
  it('confirma usuário e sessão ativos a cada requisição protegida', async () => {
    await expect(
      strategy.validate({
        sub: user.id,
        sid: '4a76e6ec-61c1-497e-931a-e1e8f9c15331',
      }),
    ).resolves.toBe(user);
    expect(sessions.validateActiveSession).toHaveBeenCalledWith(
      user.id,
      '4a76e6ec-61c1-497e-931a-e1e8f9c15331',
    );
  });

  it.each([
    {},
    { sub: 'não-uuid', sid: '4a76e6ec-61c1-497e-931a-e1e8f9c15331' },
    { sub: user.id, sid: 'não-uuid' },
  ])('rejeita dados de identidade malformados', (payload) => {
    expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
  });
});
