import { MigrationInterface, QueryRunner } from 'typeorm';

// ---------------------------------------------
// Situação do produto — arquivamento
// Produto vendido não podia ser apagado (FK NO ACTION em order_items) nem
// tirado de venda de nenhuma outra forma — a auditoria de 2026-09-17
// encontrou isso como a lacuna raiz por trás de "não consigo excluir
// produto". ARQUIVADO some do catálogo e do formulário de compra sem tocar
// no histórico: order_items já congela nome e preço, então nenhum pedido
// antigo depende do produto continuar ATIVO. Todo produto existente nasce
// ATIVO — nenhum dado muda de significado com esta migration.
//
// Coluna chamada "status" (não "situacao"): mesmo padrão de orders.status e
// payments.status, coluna em inglês com a propriedade em PT-BR na entidade
// — "products_status_enum" é o nome que o TypeORM geraria por convenção
// própria (<tabela>_<coluna>_enum) para essa combinação.
// ---------------------------------------------
export class AddProductSituacao1787900000013 implements MigrationInterface {
  name = 'AddProductSituacao1787900000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "products_status_enum" AS ENUM('ATIVO', 'ARQUIVADO')`,
    );
    await queryRunner.query(
      `ALTER TABLE "products"
         ADD "status" "products_status_enum" NOT NULL DEFAULT 'ATIVO'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_products_status" ON "products" ("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_products_status"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "status"`);
    await queryRunner.query(`DROP TYPE "products_status_enum"`);
  }
}
