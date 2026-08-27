import { createDataSourceOptions } from './database-options';

describe('createDataSourceOptions', () => {
  // ---------------------------------------------
  // Configuração da conexão principal
  // ---------------------------------------------
  it('usa DATABASE_URL fora do ambiente de teste', () => {
    const options = createDataSourceOptions({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://localhost/app',
    });

    expect(options).toEqual(
      expect.objectContaining({
        type: 'postgres',
        url: 'postgresql://localhost/app',
        synchronize: false,
        uuidExtension: 'pgcrypto',
      }),
    );
  });

  // ---------------------------------------------
  // Isolamento do banco de testes
  // ---------------------------------------------
  it('recusa testes sem um banco isolado', () => {
    expect(() =>
      createDataSourceOptions({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://localhost/app',
      }),
    ).toThrow('TEST_DATABASE_URL é obrigatória');
  });

  it('recusa testes quando a URL isolada é igual à principal', () => {
    expect(() =>
      createDataSourceOptions({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://localhost/app',
        TEST_DATABASE_URL: 'postgresql://localhost/app',
      }),
    ).toThrow('TEST_DATABASE_URL deve apontar para um banco isolado');
  });

  it('usa TEST_DATABASE_URL quando ela é isolada', () => {
    const options = createDataSourceOptions({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://localhost/app',
      TEST_DATABASE_URL: 'postgresql://localhost/app_test',
    });

    expect(options.url).toBe('postgresql://localhost/app_test');
  });
});
