import { DataSource } from 'typeorm';
import { abrirBancoDeTeste, fecharBancoDeTeste, limparTabelas } from './ambiente';

// ---------------------------------------------
// Migration de dinheiro para centavos
// A conversão float -> inteiro é a operação mais arriscada desta fase: roda
// uma vez, em cima de dado real, e um centavo perdido por produto não volta.
// Este arquivo desfaz a migration, grava valores em float como estavam antes,
// reaplica, e confere o resultado.
//
// O valor 19.90 é o caso que motiva tudo: em ponto flutuante, 19.9 * 100 dá
// 1989.9999999999998, e truncar produziria 1989. É por isso que a migration
// converte passando por numeric antes de arredondar, em vez de multiplicar
// direto no float.
// ---------------------------------------------
describe('MoneyToCents (integração)', () => {
  let conexao: DataSource;

  beforeAll(async () => {
    conexao = await abrirBancoDeTeste();
  });

  afterAll(async () => {
    // deixa o banco no estado final esperado pelas demais suítes
    await conexao.runMigrations();
    await fecharBancoDeTeste();
  });

  beforeEach(async () => {
    await limparTabelas(conexao);
  });

  it('converte reais em centavos sem perder o centavo do arredondamento', async () => {
    await conexao.undoLastMigration();

    await conexao.query(
      `INSERT INTO categories (id, name) VALUES (901, 'Categoria de teste')`,
    );
    await conexao.query(
      `INSERT INTO products (id, name, price, stock, "categoryId") VALUES
         (901, 'Preço com dízima em float', 19.90, 10, 901),
         (902, 'Preço de um centavo', 0.01, 10, 901),
         (903, 'Preço alto', 1234.56, 10, 901),
         (904, 'Preço redondo', 20, 10, 901)`,
    );

    await conexao.runMigrations();

    const linhas: Array<{ id: number; priceInCents: number }> =
      await conexao.query(
        `SELECT id, "priceInCents" FROM products ORDER BY id`,
      );

    expect(linhas).toEqual([
      { id: 901, priceInCents: 1990 },
      { id: 902, priceInCents: 1 },
      { id: 903, priceInCents: 123456 },
      { id: 904, priceInCents: 2000 },
    ]);
  });

  // ---------------------------------------------
  // Por que a validação @IsInt do DTO é carga, não redundância
  // O primeiro palpite ao escrever este caso foi que a coluna integer
  // recusaria uma fração. Ela não recusa: o Postgres arredonda em silêncio,
  // e 19.9 vira 20 sem erro nenhum. Ou seja, o banco não é a última linha de
  // defesa contra preço fracionário — quem barra é o @IsInt em
  // CriarProdutoDto/AtualizarProdutoDto. Tirar aquele decorator não quebraria
  // nada visivelmente; só passaria a gravar preço errado, arredondado.
  // ---------------------------------------------
  it('a coluna inteira arredonda fração em silêncio, em vez de recusar', async () => {
    await conexao.query(
      `INSERT INTO categories (id, name) VALUES (905, 'Outra categoria')`,
    );
    await conexao.query(
      `INSERT INTO products (id, name, "priceInCents", stock, "categoryId")
         VALUES (905, 'Tentativa de fração', 19.9, 10, 905)`,
    );

    const linhas: Array<{ priceInCents: number }> = await conexao.query(
      `SELECT "priceInCents" FROM products WHERE id = 905`,
    );
    expect(linhas[0].priceInCents).toBe(20);
  });

  it('reversão devolve o formato antigo em reais', async () => {
    await conexao.query(
      `INSERT INTO categories (id, name) VALUES (906, 'Categoria da reversão')`,
    );
    await conexao.query(
      `INSERT INTO products (id, name, "priceInCents", stock, "categoryId")
         VALUES (906, 'Produto da reversão', 1990, 10, 906)`,
    );

    await conexao.undoLastMigration();

    const linhas: Array<{ price: number }> = await conexao.query(
      `SELECT price FROM products WHERE id = 906`,
    );
    expect(Number(linhas[0].price)).toBeCloseTo(19.9, 5);

    await conexao.runMigrations();
  });
});
