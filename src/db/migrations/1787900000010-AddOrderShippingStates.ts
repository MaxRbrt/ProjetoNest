import { MigrationInterface, QueryRunner } from 'typeorm';

// ---------------------------------------------
// Estados de logística do pedido
// Postgres permite ADD VALUE num enum existente sem recriar o tipo, mas NÃO
// permite remover valor — não existe DROP VALUE. A reversão por isso precisa
// recriar o tipo do zero (renomear, criar o novo sem os valores extras, mover
// a coluna com USING, apagar o antigo), e só é segura se nenhum pedido estiver
// em ENVIADO/ENTREGUE — a própria migration recusa reverter nesse caso, em vez
// de silenciosamente truncar dado para PENDENTE ou falhar com erro cru do
// Postgres.
// ---------------------------------------------
export class AddOrderShippingStates1787900000010 implements MigrationInterface {
  name = 'AddOrderShippingStates1787900000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "orders_status_enum" ADD VALUE IF NOT EXISTS 'ENVIADO'`,
    );
    await queryRunner.query(
      `ALTER TYPE "orders_status_enum" ADD VALUE IF NOT EXISTS 'ENTREGUE'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const emUso: Array<{ n: number }> = await queryRunner.query(
      `SELECT COUNT(*)::int AS n FROM "orders" WHERE "status" IN ('ENVIADO', 'ENTREGUE')`,
    );
    if (emUso[0].n > 0) {
      throw new Error(
        'Não é possível reverter AddOrderShippingStates: existem pedidos ' +
          'com situação ENVIADO ou ENTREGUE. Resolva-os manualmente antes ' +
          'de reverter esta migration.',
      );
    }

    await queryRunner.query(
      `ALTER TYPE "orders_status_enum" RENAME TO "orders_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "orders_status_enum" AS ENUM('PENDENTE', 'PAGO', 'CANCELADO')`,
    );
    await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "status" TYPE "orders_status_enum"
         USING "status"::text::"orders_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDENTE'`,
    );
    await queryRunner.query(`DROP TYPE "orders_status_enum_old"`);
  }
}
