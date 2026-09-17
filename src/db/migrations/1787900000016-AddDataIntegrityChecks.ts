import { MigrationInterface, QueryRunner } from 'typeorm';

// ---------------------------------------------
// Rede de segurança no banco para invariantes que hoje só existem na
// aplicação — achados da auditoria de 2026-09-17.
//
// 1. payment_webhook_events.paymentId nunca teve chave estrangeira: apagar
//    um pagamento (nenhum caminho faz isso hoje, mas nada impede no banco)
//    deixaria a linha de idempotência órfã, ainda bloqueando o eventId de
//    um pagamento que não existe mais. CASCADE porque o evento não tem
//    sentido sem o pagamento que ele confirma — mesmo raciocínio de
//    payments -> orders.
// 2. CHECK (stock >= 0) e CHECK (priceInCents > 0) em products, e
//    CHECK (quantity > 0) em order_items: a aplicação já valida os três na
//    entrada (DTO), mas nenhuma constraint no banco impedia um caminho
//    futuro (migration de dado, script, edição direta) de gravar estoque
//    negativo, preço zero/negativo ou item de quantidade zero.
// ---------------------------------------------
export class AddDataIntegrityChecks1787900000016
  implements MigrationInterface
{
  name = 'AddDataIntegrityChecks1787900000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "FK_payment_webhook_events_payment"
         FOREIGN KEY ("paymentId") REFERENCES "payments"("id")
         ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "CHK_products_stock_non_negative"
         CHECK ("stock" >= 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "CHK_products_price_positive"
         CHECK ("priceInCents" > 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "CHK_order_items_quantity_positive"
         CHECK ("quantity" > 0)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "CHK_order_items_quantity_positive"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "CHK_products_price_positive"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "CHK_products_stock_non_negative"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_webhook_events" DROP CONSTRAINT "FK_payment_webhook_events_payment"`,
    );
  }
}
