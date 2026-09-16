import { MigrationInterface, QueryRunner } from 'typeorm';

// ---------------------------------------------
// Pagamentos e razão de idempotência do webhook
// payment_webhook_events tem eventId como chave primária, não como índice
// único sobre outra PK — é o INSERT falhando por violação de PK que decide
// "evento já processado", sem depender de um SELECT antes que teria sua
// própria corrida. Ver o comentário da entidade para o raciocínio completo.
// ---------------------------------------------
export class CreatePayments1787900000009 implements MigrationInterface {
  name = 'CreatePayments1787900000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "payments_status_enum" AS ENUM('PENDENTE', 'APROVADO', 'RECUSADO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payments" (
         "id" SERIAL NOT NULL,
         "orderId" integer NOT NULL,
         "status" "payments_status_enum" NOT NULL DEFAULT 'PENDENTE',
         "cardLastDigits" character(4) NOT NULL,
         "declineReason" character varying(255),
         "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         CONSTRAINT "PK_payments" PRIMARY KEY ("id")
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_order" ON "payments" ("orderId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_payments_order"
         FOREIGN KEY ("orderId") REFERENCES "orders"("id")
         ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(
      `REVOKE ALL ON "payments" FROM anon, authenticated`,
    );

    await queryRunner.query(
      `CREATE TABLE "payment_webhook_events" (
         "eventId" uuid NOT NULL,
         "paymentId" integer NOT NULL,
         "processedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         CONSTRAINT "PK_payment_webhook_events" PRIMARY KEY ("eventId")
       )`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_webhook_events" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `REVOKE ALL ON "payment_webhook_events" FROM anon, authenticated`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `GRANT ALL ON "payment_webhook_events" TO anon, authenticated`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_webhook_events" DISABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`DROP TABLE "payment_webhook_events"`);

    await queryRunner.query(`GRANT ALL ON "payments" TO anon, authenticated`);
    await queryRunner.query(
      `ALTER TABLE "payments" DISABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_payments_order"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_payments_order"`);
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TYPE "payments_status_enum"`);
  }
}
