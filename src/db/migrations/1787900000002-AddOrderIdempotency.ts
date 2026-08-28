import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderIdempotency1787900000002 implements MigrationInterface {
  name = 'AddOrderIdempotency1787900000002';

  // ---------------------------------------------
  // Colunas e índice único de idempotência
  // Ambas nullable: pedidos existentes e criações sem Idempotency-Key não têm
  // chave nem hash. O índice é parcial (só onde idempotencyKey não é nulo)
  // para não impedir múltiplos pedidos sem chave do mesmo usuário.
  // ---------------------------------------------
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "idempotencyKey" character varying(128)`,
    );
    await queryRunner.query(`ALTER TABLE "orders" ADD "payloadHash" char(64)`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_orders_user_idempotency_key" ON "orders" ("userId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`,
    );
  }

  // ---------------------------------------------
  // Remoção do índice único e das colunas de idempotência
  // Índice sai antes das colunas para não deixar restrição apontando para
  // coluna já removida.
  // ---------------------------------------------
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."UQ_orders_user_idempotency_key"`,
    );
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "payloadHash"`);
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN "idempotencyKey"`,
    );
  }
}
