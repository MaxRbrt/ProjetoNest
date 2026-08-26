import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnableRls1787743956010 implements MigrationInterface {
  name = 'EnableRls1787743956010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`ALTER TABLE "products" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(
      `ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "migrations" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `REVOKE ALL ON "categories", "products", "orders", "order_items", "migrations" FROM anon, authenticated`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `GRANT ALL ON "categories", "products", "orders", "order_items", "migrations" TO anon, authenticated`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" DISABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DISABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`ALTER TABLE "orders" DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(
      `ALTER TABLE "order_items" DISABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "migrations" DISABLE ROW LEVEL SECURITY`,
    );
  }
}
