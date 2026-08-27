import { OpaqueTokenService } from './opaque-token.service';

describe('OpaqueTokenService', () => {
  const service = new OpaqueTokenService();

  it('gera 256 bits em base64url e devolve somente o hash persistível', () => {
    const token = service.generate();

    expect(token.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(token.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(token.tokenHash).toBe(service.hash(token.rawToken));
    expect(token.tokenHash).not.toContain(token.rawToken);
  });

  it('gera valores independentes a cada chamada', () => {
    expect(service.generate()).not.toEqual(service.generate());
  });
});
