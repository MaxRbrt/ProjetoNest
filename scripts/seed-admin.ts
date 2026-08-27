import { DataSource, type DataSourceOptions } from 'typeorm';
import { Role, User } from '../src/modules/usuarios/entities/user.entity';

type DataSourceFactory = () => DataSource;

// ---------------------------------------------
// Promoção de usuário a administrador
// ---------------------------------------------
// A API nunca aceita papel vindo da requisição. Este script promove somente
// quem já foi cadastrado pelo fluxo normal da aplicação.
export async function promoteAdmin(
  rawEmail: string | undefined,
  createDataSource: DataSourceFactory,
): Promise<string> {
  const email = rawEmail?.trim().toLowerCase();
  if (!email) {
    throw new Error(
      'Informe o email: npm run seed:admin -- usuario@example.com',
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

async function main(): Promise<void> {
  // A configuração pode carregar variáveis locais e, por isso, só é importada
  // quando o arquivo é executado como CLI, nunca durante a importação em testes.
  const { dataSourceOptions } = require('../src/db/data-source') as {
    dataSourceOptions: DataSourceOptions;
  };
  const message = await promoteAdmin(
    process.argv[2],
    () => new DataSource({ ...dataSourceOptions, logging: false }),
  );
  console.log(message);
}

if (require.main === module) {
  void main().catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
