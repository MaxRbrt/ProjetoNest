import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderStatus1787900000003 implements MigrationInterface {
  name = 'AddOrderStatus1787900000003';

  // ---------------------------------------------
  // Criação do tipo de situação e adição da coluna em pedidos
  // Pedidos existentes migram como PENDENTE (valor padrão da coluna), que é
  // o estado em que de fato estão: nenhum deles passou por confirmação.
  // ---------------------------------------------
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."orders_status_enum" AS ENUM('PENDENTE', 'PAGO', 'CANCELADO')`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "status" "public"."orders_status_enum" NOT NULL DEFAULT 'PENDENTE'`,
    );
  }

  // ---------------------------------------------
  // Remoção da coluna e do tipo de situação
  // A coluna sai antes do tipo: na ordem inversa o tipo ainda estaria em uso
  // pela coluna e o DROP TYPE falharia.
  // ---------------------------------------------
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "status"`);
    await queryRunner.query(`DROP TYPE "public"."orders_status_enum"`);
  }
}
