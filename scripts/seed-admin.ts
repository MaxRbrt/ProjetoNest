import { DataSource, type DataSourceOptions } from 'typeorm';
import { Role, User } from '../src/modules/usuarios/entities/user.entity';

type DataSourceFactory = () => DataSource;

export interface DatabaseTarget {
  user: string;
  host: string;
  port: string;
  database: string;
}

// ---------------------------------------------
// Extração da identidade da conexão a partir da URL
// Usada para exibir e conferir o alvo antes de conectar, sem precisar
// inicializar a conexão só para sabermos onde ela aponta. Host e banco
// sozinhos não bastam: pooler do Supabase compartilha o mesmo host entre
// projetos diferentes, distinguindo só pelo usuário e pela porta (pooler de
// transação e de sessão usam portas diferentes) — por isso os quatro campos
// entram na confirmação, não só host/database.
// ---------------------------------------------
export function extractTarget(url: string): DatabaseTarget {
  const parsed = new URL(url);
  return {
    user: decodeURIComponent(parsed.username),
    host: parsed.hostname,
    port: parsed.port || '5432',
    database: parsed.pathname.replace(/^\//, ''),
  };
}

function confirmationFlag(target: DatabaseTarget): string {
  return `--confirm-target=${target.user}@${target.host}:${target.port}/${target.database}`;
}

// ---------------------------------------------
// Promoção de usuário a administrador
// A API nunca aceita papel vindo da requisição. Este script promove somente
// quem já foi cadastrado pelo fluxo normal da aplicação. Exige confirmação
// exata do host e banco alvo antes de conectar — protege contra promover
// alguém no banco errado por um NODE_ENV digitado errado ou terminal trocado.
// ---------------------------------------------
export async function promoteAdmin(
  rawEmail: string | undefined,
  createDataSource: DataSourceFactory,
  target: DatabaseTarget,
  confirmedTarget: string | undefined,
): Promise<string> {
  const email = rawEmail?.trim().toLowerCase();
  if (!email) {
    throw new Error(
      'Informe o email: npm run seed:admin -- usuario@example.com',
    );
  }

  const expectedConfirmation = confirmationFlag(target);
  if (confirmedTarget !== expectedConfirmation) {
    throw new Error(
      `Confirme o banco alvo antes de promover: rode novamente com ${expectedConfirmation}`,
    );
  }

  const dataSource = createDataSource();
  await dataSource.initialize();

  try {
    const repository = dataSource.getRepository(User);
    const user = await repository.findOneBy({ email });
    if (!user) {
      throw new Error(`Usuário ${email} não encontrado. Cadastre-o primeiro.`);
    }

    user.role = Role.ADMIN;
    await repository.save(user);
    return `Usuário ${email} promovido a ADMIN.`;
  } finally {
    await dataSource.destroy();
  }
}

// ---------------------------------------------
// Entrada da CLI
// A configuração de banco só é importada aqui dentro (via require, não
// import no topo do arquivo) porque ela pode carregar variáveis locais —
// isso não pode acontecer durante a importação deste módulo em testes.
// ---------------------------------------------
async function main(): Promise<void> {
  const { dataSourceOptions } = require('../src/db/data-source') as {
    dataSourceOptions: DataSourceOptions;
  };
  const url = (dataSourceOptions as { url?: string }).url;
  if (!url) {
    throw new Error('Configuração de banco sem URL — não é possível confirmar o alvo.');
  }
  const target = extractTarget(url);
  const message = await promoteAdmin(
    process.argv[2],
    () => new DataSource({ ...dataSourceOptions, logging: false }),
    target,
    process.argv[3],
  );
  console.log(message);
}

if (require.main === module) {
  void main().catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
