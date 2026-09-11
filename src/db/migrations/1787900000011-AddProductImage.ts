import { MigrationInterface, QueryRunner } from 'typeorm';

// ---------------------------------------------
// Imagem do produto
// Coluna anulável e sem backfill: produto sem foto é estado normal, não
// pendência de migração — a vitrine já tem um placeholder para esse caso.
// Guardar só o nome do arquivo, e não um caminho, é o que permite trocar
// disco por outro armazenamento sem migrar dado nenhum.
// ---------------------------------------------
export class AddProductImage1787900000011 implements MigrationInterface {
  name = 'AddProductImage1787900000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" ADD "imageFileName" character varying(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN "imageFileName"`,
    );
  }
}
