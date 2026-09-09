import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { EstrategiaJwt } from './estrategia-jwt';
import { SessoesService } from './services/sessoes.service';

// ---------------------------------------------
// EstrategiaJwt
// O retorno de validate() é o que o Passport grava em request.user — ver
// GuardaDePapel e o registro do CLAUDE.md sobre nunca renomear esse campo.
// Aqui cobrimos as duas metades: payload malformado nunca chega a consultar
// sessão, e payload válido delega e devolve exatamente o que a sessão disser.
// ---------------------------------------------
describe('EstrategiaJwt', () => {
  let sessions: { validarSessaoAtiva: jest.Mock };
  let estrategia: EstrategiaJwt;

  const config = {
    getOrThrow: jest.fn((chave: string) => {
      const valores: Record<string, string> = {
        JWT_SECRET: 'segredo-de-teste',
        JWT_ISSUER: 'projeto-test',
        JWT_AUDIENCE: 'projeto-test-web',
      };
      return valores[chave];
    }),
  } as unknown as ConfigService;

  beforeEach(() => {
    sessions = { validarSessaoAtiva: jest.fn() };
    estrategia = new EstrategiaJwt(config, sessions as unknown as SessoesService);
  });

  // validate() não é async: payload malformado lança de forma síncrona,
  // antes de qualquer Promise existir — por isso o teste chama através de
  // uma função em vez de usar `.rejects`.
  it('rejeita payload sem sub, sem consultar SessoesService', () => {
    expect(() => estrategia.validate({ sid: randomUUID() })).toThrow(
      UnauthorizedException,
    );
    expect(sessions.validarSessaoAtiva).not.toHaveBeenCalled();
  });

  it('rejeita payload sem sid, sem consultar SessoesService', () => {
    expect(() => estrategia.validate({ sub: randomUUID() })).toThrow(
      UnauthorizedException,
    );
    expect(sessions.validarSessaoAtiva).not.toHaveBeenCalled();
  });

  it('rejeita payload com sub/sid que não são UUID', () => {
    expect(() =>
      estrategia.validate({ sub: 'nao-e-uuid', sid: 'tambem-nao' }),
    ).toThrow(UnauthorizedException);
    expect(sessions.validarSessaoAtiva).not.toHaveBeenCalled();
  });

  it('delega para SessoesService.validarSessaoAtiva e devolve o resultado sem transformar', async () => {
    const sub = randomUUID();
    const sid = randomUUID();
    const usuarioPublico = {
      id: sub,
      email: 'dono@teste.com',
      emailVerificado: true,
      criadoEm: new Date(),
      papel: 'CLIENTE',
    };
    sessions.validarSessaoAtiva.mockResolvedValue(usuarioPublico);

    const resultado = await estrategia.validate({ sub, sid });

    expect(sessions.validarSessaoAtiva).toHaveBeenCalledWith(sub, sid);
    expect(resultado).toBe(usuarioPublico);
  });
});
