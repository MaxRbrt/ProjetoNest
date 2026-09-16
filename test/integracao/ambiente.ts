import 'dotenv/config';
import { DataSource } from 'typeorm';
import { criarOpcoesDaFonteDeDados } from '../../src/db/opcoes-do-banco';

// ---------------------------------------------
// Banco de integração
// A fonte de dados é construída com NODE_ENV forçado para 'test', o que
// aciona a trava já existente em criarOpcoesDaFonteDeDados: sem
// TEST_DATABASE_URL, ou com ela igual a DATABASE_URL, a construção lança e a
// suíte inteira falha antes de abrir conexão. É de propósito que essa
// verificação viva no código de produção e não aqui — assim vale para
// qualquer caminho que suba a aplicação em modo de teste, não só para esta
// suíte.
//
// As migrations rodam de verdade, as 11, incluindo a de RLS. Nada de
// synchronize: o schema testado é o mesmo que a produção recebe.
// ---------------------------------------------
let fonte: DataSource | null = null;

export async function abrirBancoDeTeste(): Promise<DataSource> {
  if (fonte?.isInitialized) {
    return fonte;
  }

  const opcoes = criarOpcoesDaFonteDeDados({
    ...process.env,
    NODE_ENV: 'test',
  });

  fonte = new DataSource(opcoes);
  await fonte.initialize();
  await fonte.runMigrations();
  return fonte;
}

export async function fecharBancoDeTeste(): Promise<void> {
  if (fonte?.isInitialized) {
    await fonte.destroy();
  }
  fonte = null;
}

// ---------------------------------------------
// Limpeza entre casos
// TRUNCATE em vez de DELETE por causa do CASCADE: as tabelas de sessão e
// token têm chave estrangeira para users, e apagar na ordem errada quebraria
// por violação de referência. A tabela migrations fica de fora — apagá-la
// faria o TypeORM reexecutar todas as migrations na próxima abertura.
// ---------------------------------------------
export async function limparTabelas(conexao: DataSource): Promise<void> {
  const tabelas: Array<{ tablename: string }> = await conexao.query(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> 'migrations'`,
  );

  if (tabelas.length === 0) {
    return;
  }

  const alvos = tabelas.map((linha) => `"${linha.tablename}"`).join(', ');

  await conexao.query(`TRUNCATE TABLE ${alvos} RESTART IDENTITY CASCADE`);
}
