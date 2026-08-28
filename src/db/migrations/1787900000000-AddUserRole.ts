import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserRole1787900000000 implements MigrationInterface {
  name = 'AddUserRole1787900000000';

  // ---------------------------------------------
  // Criação do tipo de papel e adição da coluna na tabela de usuários
  // Usuários existentes migram como CLIENTE (valor padrão da coluna).
  // ---------------------------------------------
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('ADMIN', 'CLIENTE')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "role" "public"."users_role_enum" NOT NULL DEFAULT 'CLIENTE'`,
    );
  }

  // ---------------------------------------------
  // Remoção da coluna e do tipo de papel
  // A coluna sai antes do tipo: se a ordem fosse invertida, o tipo ainda
  // estaria em uso pela coluna e o DROP TYPE falharia.
  // ---------------------------------------------
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
  }
}
