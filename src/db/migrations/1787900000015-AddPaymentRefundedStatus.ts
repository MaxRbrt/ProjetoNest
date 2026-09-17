import { MigrationInterface, QueryRunner } from 'typeorm';

// ---------------------------------------------
// Estado de estorno do pagamento
// Hoje um admin cancelando pedido PAGO não deixa nenhum rastro em payments —
// a linha aprovada continua "APROVADO" para sempre, como se o dinheiro nunca
// tivesse sido devolvido nem o pedido cancelado. ESTORNADO é o estado
// terminal que o cancelamento passa a gravar na mesma transação (ver
// PedidosService.atualizarSituacao). Mesmo padrão de ADD VALUE sem recriar o
// tipo já usado em AddOrderShippingStates — a reversão recria o tipo do
// zero e recusa rodar se algum pagamento estiver ESTORNADO.
// ---------------------------------------------
export class AddPaymentRefundedStatus1787900000015
  implements MigrationInterface
{
  name = 'AddPaymentRefundedStatus1787900000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "payments_status_enum" ADD VALUE IF NOT EXISTS 'ESTORNADO'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const emUso = (await queryRunner.query(
      `SELECT COUNT(*)::int AS n FROM "payments" WHERE "status" = 'ESTORNADO'`,
    )) as Array<{ n: number }>;
    if (emUso[0].n > 0) {
      throw new Error(
        'Não é possível reverter AddPaymentRefundedStatus: existem ' +
          'pagamentos com situação ESTORNADO. Resolva-os manualmente antes ' +
          'de reverter esta migration.',
      );
    }

    await queryRunner.query(
      `ALTER TYPE "payments_status_enum" RENAME TO "payments_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "payments_status_enum" AS ENUM('PENDENTE', 'APROVADO', 'RECUSADO')`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "status" TYPE "payments_status_enum"
         USING "status"::text::"payments_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'PENDENTE'`,
    );
    await queryRunner.query(`DROP TYPE "payments_status_enum_old"`);
  }
}
