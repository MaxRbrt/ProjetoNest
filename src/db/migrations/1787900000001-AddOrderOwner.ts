import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderOwner1787900000001 implements MigrationInterface {
  name = 'AddOrderOwner1787900000001';

  // ---------------------------------------------
  // Vinculação do pedido ao usuário dono
  // ---------------------------------------------
  // Os pedidos existentes são dados de teste sem dono. Como userId é NOT NULL,
  // precisam sair antes da coluna entrar. Itens primeiro, por causa da FK.
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "order_items"`);
    await queryRunner.query(`DELETE FROM "orders"`);

    await queryRunner.query(`ALTER TABLE "orders" ADD "userId" uuid NOT NULL`);
    await queryRunner.query(
      `CREATE INDEX "IDX_orders_user" ON "orders" ("userId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  // ---------------------------------------------
  // Remoção do vínculo entre pedido e usuário dono
  // ---------------------------------------------
  // FK, índice e coluna saem em ordem inversa à criação para não deixar
  // dependência apontando para um objeto já removido.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_user"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_orders_user"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "userId"`);
  }
}
