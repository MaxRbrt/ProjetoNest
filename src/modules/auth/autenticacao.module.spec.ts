import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AutenticacaoModule } from './autenticacao.module';
import { TokenDeAcao } from './entities/token-de-acao.entity';
import { SessaoDeAutenticacao } from './entities/sessao-de-autenticacao.entity';
import { TokenDeRenovacao } from './entities/token-de-renovacao.entity';
import { Usuario } from '../usuarios/usuario.entity';

// ---------------------------------------------
// AutenticacaoModule — smoke test de boot
// Não é e2e HTTP: só prova que a árvore de injeção de dependência do módulo
// (e dos módulos que ele importa, UsuariosModule/EmailModule) resolve sem
// estourar. É a classe de bug que nenhum unit test acima pega — ver
// CLAUDE.md: @Index(['userId', ...]) desalinhado quebrava o boot real sem
// nenhum erro de tsc, só descoberto rodando a aplicação de verdade.
// ---------------------------------------------
describe('AutenticacaoModule', () => {
  it('compila via Nest DI sem lançar', async () => {
    const valoresDeConfig: Record<string, unknown> = {
      JWT_SECRET: 'segredo-de-teste-com-tamanho-suficiente',
      JWT_ISSUER: 'projeto-test',
      JWT_AUDIENCE: 'projeto-test-web',
      HIBP_API_URL: 'https://api.hibp.test',
      HIBP_TIMEOUT_MS: 2_000,
      AUTH_MIN_RESPONSE_MS: 0,
      EMAIL_PROVIDER: 'file',
      FRONTEND_URL: 'http://localhost:3001',
      NODE_ENV: 'test',
    };
    const configMock: Partial<ConfigService> = {
      getOrThrow: jest.fn((chave: string) => {
        if (!(chave in valoresDeConfig)) {
          throw new Error(
            `chave de config não prevista no smoke test: ${chave}`,
          );
        }
        return valoresDeConfig[chave];
      }),
      get: jest.fn((chave: string) => valoresDeConfig[chave]),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        AutenticacaoModule,
      ],
    })
      .overrideProvider(ConfigService)
      .useValue(configMock)
      .overrideProvider(getRepositoryToken(Usuario))
      .useValue({})
      .overrideProvider(getRepositoryToken(SessaoDeAutenticacao))
      .useValue({})
      .overrideProvider(getRepositoryToken(TokenDeRenovacao))
      .useValue({})
      .overrideProvider(getRepositoryToken(TokenDeAcao))
      .useValue({})
      .compile();

    expect(moduleRef).toBeDefined();
  });
});
