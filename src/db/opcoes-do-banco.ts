import { DataSourceOptions } from 'typeorm';

// ---------------------------------------------
// Configuração da conexão com PostgreSQL
// Em ambiente de teste a URL separada é obrigatória: testes nunca podem
// herdar silenciosamente o banco principal, sob risco de destruir ou
// contaminar dados reais. O synchronize permanece desligado para que somente
// migrations versionadas alterem o schema.
// ---------------------------------------------
export function criarOpcoesDaFonteDeDados(
  environment: NodeJS.ProcessEnv,
): DataSourceOptions {
  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL é obrigatória');
  }

  let url = databaseUrl;
  if (environment.NODE_ENV === 'test') {
    const testDatabaseUrl = environment.TEST_DATABASE_URL;
    if (!testDatabaseUrl) {
      throw new Error('TEST_DATABASE_URL é obrigatória em ambiente de teste');
    }
    if (testDatabaseUrl === databaseUrl) {
      throw new Error(
        'TEST_DATABASE_URL deve apontar para um banco isolado de DATABASE_URL',
      );
    }
    url = testDatabaseUrl;
  }

  return {
    type: 'postgres',
    url,
    entities: [__dirname + '/../modules/**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/migrations/*{.ts,.js}'],
    synchronize: false,
    uuidExtension: 'pgcrypto',
  };
}
