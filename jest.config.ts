import type { Config } from 'jest';

// ---------------------------------------------
// Configuração do Jest
// tsconfig.spec.json força module/moduleResolution para commonjs porque o
// tsconfig.json principal usa "nodenext" (voltado para o build real via
// nest build) e o ts-jest roda melhor sob commonjs simples.
// ---------------------------------------------
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.spec.json' }],
  },
};

export default config;
