import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCategories1787679353968 implements MigrationInterface {
  name = 'CreateCategories1787679353968';

  // ---------------------------------------------
  // Criação da tabela de categorias
  // ---------------------------------------------
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "categories" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`,
    );
  }

  // ---------------------------------------------
  // Remoção da tabela de categorias
  // ---------------------------------------------
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "categories"`);
  }
}
