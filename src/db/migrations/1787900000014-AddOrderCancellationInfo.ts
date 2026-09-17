import { MigrationInterface, QueryRunner } from 'typeorm';

// ---------------------------------------------
// Rastro do cancelamento de pedido
// Hoje um pedido cancelado é indistinguível entre "o cliente cancelou" e "o
// admin cancelou", e não guarda por quê — achado da auditoria de
// 2026-09-17. canceledByUserId aponta para quem executou a ação (cliente
// dono ou admin), não para o dono do pedido, que já existe em userId.
// ON DELETE SET NULL: apagar o usuário que cancelou não pode apagar o
// pedido nem o histórico de quem o comprou — só perde a atribuição de quem
// cancelou, igual ao padrão já usado em addressId.
//
// Sem CHECK de coerência aqui de propósito: as três colunas nascem nullable
// e soltas nesta migration porque PedidosService.atualizarSituacao ainda não
// as preenche (isso é trabalho da Fase B da auditoria). Uma primeira versão
// desta migration incluía CHECK (status = CANCELADO <=> canceledAt IS NOT
// NULL) e quebrou 14 testes de integração pré-existentes na hora — todo
// código e fixture de teste que grava CANCELADO sem tocar canceledAt (o
// service atual, e cenários de teste que fazem UPDATE direto) violava a
// constraint. O CHECK volta numa migration própria junto com a Fase B,
// quando o service passa a preencher as três colunas em toda transição para
// CANCELADO — schema e comportamento chegam juntos, não o schema sozinho
// impondo uma regra que o código ainda não cumpre.
// ---------------------------------------------
export class AddOrderCancellationInfo1787900000014
  implements MigrationInterface
{
  name = 'AddOrderCancellationInfo1787900000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders"
         ADD "canceledAt" TIMESTAMP WITH TIME ZONE,
         ADD "canceledByUserId" uuid,
         ADD "cancellationReason" character varying(300)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_canceled_by"
         FOREIGN KEY ("canceledByUserId") REFERENCES "users"("id")
         ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_canceled_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders"
         DROP COLUMN "cancellationReason",
         DROP COLUMN "canceledByUserId",
         DROP COLUMN "canceledAt"`,
    );
  }
}
