import { MigrationInterface, QueryRunner } from 'typeorm';

// ---------------------------------------------
// Frete: subtotal, custo, modalidade e prazo congelados no pedido
// Pedidos existentes nunca tiveram frete (a feature não existia): o total
// deles já era puramente subtotal, então o backfill é subtotalInCents =
// totalInCents, custo zero, modalidade PAC como placeholder — não altera o
// totalInCents desses pedidos, só decompõe o valor que já existia.
// ---------------------------------------------
export class AddShipping1787900000008 implements MigrationInterface {
  name = 'AddShipping1787900000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders"
         ADD "subtotalInCents" integer,
         ADD "shippingCostInCents" integer,
         ADD "shippingMethod" character varying(10),
         ADD "shippingEstimatedDays" integer`,
    );

    await queryRunner.query(
      `UPDATE "orders" SET
         "subtotalInCents" = "totalInCents",
         "shippingCostInCents" = 0,
         "shippingMethod" = 'PAC',
         "shippingEstimatedDays" = 0
       WHERE "subtotalInCents" IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "orders"
         ALTER COLUMN "subtotalInCents" SET NOT NULL,
         ALTER COLUMN "shippingCostInCents" SET NOT NULL,
         ALTER COLUMN "shippingMethod" SET NOT NULL,
         ALTER COLUMN "shippingEstimatedDays" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders"
         DROP COLUMN "subtotalInCents",
         DROP COLUMN "shippingCostInCents",
         DROP COLUMN "shippingMethod",
         DROP COLUMN "shippingEstimatedDays"`,
    );
  }
}
