import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceIndexes1787900000005 implements MigrationInterface {
  name = 'AddPerformanceIndexes1787900000005';

  // ---------------------------------------------
  // Índices das colunas de chave estrangeira consultadas
  // O Postgres não cria índice automático para o lado que referencia uma FK.
  // Sem eles: cancelar pedido varre order_items inteira enquanto segura o
  // lock do pedido, a remoção de produto varre a mesma tabela, e o filtro por
  // categoria varre products a cada busca da vitrine.
  // ---------------------------------------------
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_order_items_order" ON "order_items" ("orderId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_order_items_product" ON "order_items" ("productId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_products_category" ON "products" ("categoryId")`,
    );
  }

  // ---------------------------------------------
  // Remoção dos índices de consulta
  // ---------------------------------------------
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_products_category"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_order_items_product"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_order_items_order"`);
  }
}
