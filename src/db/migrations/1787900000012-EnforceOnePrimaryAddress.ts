import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceOnePrimaryAddress1787900000012
  implements MigrationInterface
{
  name = 'EnforceOnePrimaryAddress1787900000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_addresses_one_primary_per_user"
       ON "addresses" ("userId")
       WHERE "principal" = true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."UQ_addresses_one_primary_per_user"`,
    );
  }
}
