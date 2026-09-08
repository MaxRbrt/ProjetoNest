import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProducts1787679693383 implements MigrationInterface {
  name = 'CreateProducts1787679693383';

  // ---------------------------------------------
  // Criação de produtos e vínculo com categorias
  // ---------------------------------------------
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "products" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "price" double precision NOT NULL, "stock" integer NOT NULL, "categoryId" integer NOT NULL, CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_ff56834e735fa78a15d0cf21926" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  // ---------------------------------------------
  // Reversão de produtos e dependências
  // A chave estrangeira precisa sair antes da tabela que ela protege.
  // ---------------------------------------------
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_ff56834e735fa78a15d0cf21926"`,
    );
    await queryRunner.query(`DROP TABLE "products"`);
  }
}
