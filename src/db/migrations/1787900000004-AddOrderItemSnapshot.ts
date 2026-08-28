import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderItemSnapshot1787900000004 implements MigrationInterface {
  name = 'AddOrderItemSnapshot1787900000004';

  // ---------------------------------------------
  // Registro histórico de nome e preço no item do pedido
  // As colunas entram aceitando nulo, recebem os dados do produto atual e só
  // então viram NOT NULL: itens já existentes precisam de valor antes da
  // restrição, senão o ALTER falha. O COALESCE cobre item cujo produto tenha
  // sumido, preservando a linha em vez de abortar a migration inteira.
  // ---------------------------------------------
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD "productName" character varying(255)`,
    );
    await queryRunner.query(`ALTER TABLE "order_items" ADD "unitPrice" float`);

    await queryRunner.query(`
      UPDATE "order_items" AS oi
      SET "productName" = COALESCE(p."name", 'Produto removido'),
          "unitPrice" = COALESCE(p."price", 0)
      FROM "products" AS p
      WHERE p."id" = oi."productId"
    `);
    await queryRunner.query(`
      UPDATE "order_items"
      SET "productName" = 'Produto removido', "unitPrice" = 0
      WHERE "productName" IS NULL OR "unitPrice" IS NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "order_items" ALTER COLUMN "productName" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ALTER COLUMN "unitPrice" SET NOT NULL`,
    );
  }

  // ---------------------------------------------
  // Remoção do registro histórico do item
  // ---------------------------------------------
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP COLUMN "unitPrice"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP COLUMN "productName"`,
    );
  }
}
