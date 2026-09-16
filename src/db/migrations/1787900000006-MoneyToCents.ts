import { MigrationInterface, QueryRunner } from 'typeorm';

// ---------------------------------------------
// Dinheiro em centavos inteiros
// Sai `float`, entra `integer` de centavos. Não é `numeric(12,2)` porque o
// TypeORM devolve numeric como string, o que quebraria todo cálculo — é
// justamente por isso que esta dívida ficou parada. Centavo inteiro resolve
// as duas coisas de uma vez: sem ponto flutuante e sem string.
//
// A coluna é renomeada junto (price -> priceInCents) porque o que mudou foi a
// unidade, não o idioma: uma coluna "price" com 1990 dentro faria quem
// consulta o banco direto ler mil novecentos e noventa reais.
//
// A conversão passa por numeric antes de arredondar. Em float, 19.9 * 100 dá
// 1989.9999999999998, e truncar levaria a 1989 — um centavo a menos em cada
// produto. O cast para numeric torna a multiplicação exata e ROUND resolve o
// resto.
//
// Coluna nova, UPDATE, NOT NULL, DROP da antiga — em vez de ALTER TYPE USING.
// A sequência é mais longa mas cada passo é reversível, e a antiga só some
// depois que a nova está preenchida e validada.
// ---------------------------------------------
export class MoneyToCents1787900000006 implements MigrationInterface {
  name = 'MoneyToCents1787900000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN "priceInCents" integer`,
    );
    await queryRunner.query(
      `UPDATE "products" SET "priceInCents" = ROUND(("price")::numeric * 100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ALTER COLUMN "priceInCents" SET NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "price"`);

    await queryRunner.query(
      `ALTER TABLE "order_items" ADD COLUMN "unitPriceInCents" integer`,
    );
    await queryRunner.query(
      `UPDATE "order_items" SET "unitPriceInCents" = ROUND(("unitPrice")::numeric * 100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ALTER COLUMN "unitPriceInCents" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP COLUMN "unitPrice"`,
    );

    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "totalInCents" integer`,
    );
    await queryRunner.query(
      `UPDATE "orders" SET "totalInCents" = ROUND(("total")::numeric * 100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "totalInCents" SET NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "total"`);
  }

  // ---------------------------------------------
  // Reversão para ponto flutuante
  // Perde precisão de propósito: é o formato antigo que era impreciso. A
  // divisão por 100.0 força contexto numérico e evita divisão inteira.
  // ---------------------------------------------
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "total" double precision`,
    );
    await queryRunner.query(
      `UPDATE "orders" SET "total" = "totalInCents" / 100.0`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "total" SET NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "totalInCents"`);

    await queryRunner.query(
      `ALTER TABLE "order_items" ADD COLUMN "unitPrice" double precision`,
    );
    await queryRunner.query(
      `UPDATE "order_items" SET "unitPrice" = "unitPriceInCents" / 100.0`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ALTER COLUMN "unitPrice" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP COLUMN "unitPriceInCents"`,
    );

    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN "price" double precision`,
    );
    await queryRunner.query(
      `UPDATE "products" SET "price" = "priceInCents" / 100.0`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ALTER COLUMN "price" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN "priceInCents"`,
    );
  }
}
