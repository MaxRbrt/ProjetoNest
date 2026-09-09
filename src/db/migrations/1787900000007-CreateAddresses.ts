import { MigrationInterface, QueryRunner } from 'typeorm';

// ---------------------------------------------
// Endereços de entrega e congelamento no pedido
// A tabela orders ganha as colunas de endereço congelado como NOT NULL desde
// já: como não há pedido em produção anterior a esta migration com endereço
// (a feature não existia), não há dado legado para migrar — diferente da
// migration de dinheiro, que precisou de UPDATE antes do NOT NULL.
// ---------------------------------------------
export class CreateAddresses1787900000007 implements MigrationInterface {
  name = 'CreateAddresses1787900000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "addresses" (
         "id" SERIAL NOT NULL,
         "userId" uuid NOT NULL,
         "apelido" character varying(60) NOT NULL,
         "destinatario" character varying(120) NOT NULL,
         "cep" character(8) NOT NULL,
         "logradouro" character varying(200) NOT NULL,
         "numero" character varying(20) NOT NULL,
         "complemento" character varying(100),
         "bairro" character varying(100) NOT NULL,
         "cidade" character varying(100) NOT NULL,
         "uf" character(2) NOT NULL,
         "principal" boolean NOT NULL DEFAULT false,
         "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         CONSTRAINT "PK_addresses" PRIMARY KEY ("id")
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_addresses_user" ON "addresses" ("userId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "addresses" ADD CONSTRAINT "FK_addresses_user"
         FOREIGN KEY ("userId") REFERENCES "users"("id")
         ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Mesma política das demais tabelas de domínio (migration EnableRls): o
    // papel da API pública do Supabase não recebe nenhum privilégio direto.
    await queryRunner.query(
      `ALTER TABLE "addresses" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `REVOKE ALL ON "addresses" FROM anon, authenticated`,
    );

    await queryRunner.query(
      `ALTER TABLE "orders"
         ADD "addressId" integer,
         ADD "shippingRecipient" character varying(120),
         ADD "shippingCep" character(8),
         ADD "shippingStreet" character varying(200),
         ADD "shippingNumber" character varying(20),
         ADD "shippingComplement" character varying(100),
         ADD "shippingNeighborhood" character varying(100),
         ADD "shippingCity" character varying(100),
         ADD "shippingState" character(2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_address"
         FOREIGN KEY ("addressId") REFERENCES "addresses"("id")
         ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // Pedidos existentes (dado de desenvolvimento, sem endereço real) recebem
    // um placeholder para permitir o NOT NULL: são pedidos que já não têm
    // relação com um destino de entrega de verdade.
    await queryRunner.query(
      `UPDATE "orders" SET
         "shippingRecipient" = 'Endereço não informado (pedido anterior a esta feature)',
         "shippingCep" = '00000000',
         "shippingStreet" = 'Não informado',
         "shippingNumber" = 'S/N',
         "shippingNeighborhood" = 'Não informado',
         "shippingCity" = 'Não informado',
         "shippingState" = 'SP'
       WHERE "shippingRecipient" IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "orders"
         ALTER COLUMN "shippingRecipient" SET NOT NULL,
         ALTER COLUMN "shippingCep" SET NOT NULL,
         ALTER COLUMN "shippingStreet" SET NOT NULL,
         ALTER COLUMN "shippingNumber" SET NOT NULL,
         ALTER COLUMN "shippingNeighborhood" SET NOT NULL,
         ALTER COLUMN "shippingCity" SET NOT NULL,
         ALTER COLUMN "shippingState" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_address"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders"
         DROP COLUMN "addressId",
         DROP COLUMN "shippingRecipient",
         DROP COLUMN "shippingCep",
         DROP COLUMN "shippingStreet",
         DROP COLUMN "shippingNumber",
         DROP COLUMN "shippingComplement",
         DROP COLUMN "shippingNeighborhood",
         DROP COLUMN "shippingCity",
         DROP COLUMN "shippingState"`,
    );

    await queryRunner.query(
      `GRANT ALL ON "addresses" TO anon, authenticated`,
    );
    await queryRunner.query(
      `ALTER TABLE "addresses" DISABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "addresses" DROP CONSTRAINT "FK_addresses_user"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_addresses_user"`);
    await queryRunner.query(`DROP TABLE "addresses"`);
  }
}
