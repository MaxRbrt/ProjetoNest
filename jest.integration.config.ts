import type { Config } from 'jest';

// ---------------------------------------------
// Configuração dos testes de integração
// Separada da unitária de propósito: estes testes exigem um Postgres de pé
// (docker-compose.test.yml) e são bem mais lentos, então não podem entrar no
// `npm test` que roda a cada mudança. O sufixo é .int-spec.ts, que não casa
// com o testRegex da configuração unitária (`.*\.spec\.ts$`) — as duas suítes
// nunca se pegam por engano.
//
// testTimeout generoso porque a primeira execução roda as 11 migrations
// contra um banco recém-criado; maxWorkers em 1 porque os casos truncam
// tabelas compartilhadas e rodar em paralelo faria um teste apagar o dado do
// outro no meio da execução.
// ---------------------------------------------
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'test/integracao',
  testRegex: '.*\\.int-spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../../tsconfig.spec.json' }],
  },
  testTimeout: 30_000,
  maxWorkers: 1,
};

export default config;
