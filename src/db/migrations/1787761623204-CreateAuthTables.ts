import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthTables1787761623204 implements MigrationInterface {
  name = 'CreateAuthTables1787761623204';

  // ---------------------------------------------
  // Criação da estrutura de autenticação
  // Os papéis `anon` e `authenticated` podem não existir fora do Supabase, por
  // isso o REVOKE deles vai num bloco condicional: a migration continua
  // portável sem deixar de fechar o acesso onde eles existem.
  // ---------------------------------------------
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------------------------------------------
    // Usuários e unicidade de email
    // ---------------------------------------------
    await queryRunner.query(`
            CREATE TABLE "users" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "email" character varying(254) NOT NULL,
                "passwordHash" text NOT NULL,
                "emailVerifiedAt" TIMESTAMP WITH TIME ZONE,
                "failedLoginAttempts" integer NOT NULL DEFAULT '0',
                "lockedUntil" TIMESTAMP WITH TIME ZONE,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "CHK_users_failed_login_attempts" CHECK ("failedLoginAttempts" >= 0),
                CONSTRAINT "CHK_users_email_normalized" CHECK ("email" = lower(btrim("email"))),
                CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_users_email" ON "users" ("email")
        `);
    // ---------------------------------------------
    // Tokens de verificação e recuperação
    // ---------------------------------------------
    await queryRunner.query(`
            CREATE TABLE "auth_action_tokens" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "userId" uuid NOT NULL,
                "type" character varying(32) NOT NULL,
                "tokenHash" character(64) NOT NULL,
                "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
                "usedAt" TIMESTAMP WITH TIME ZONE,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "CHK_auth_action_tokens_type" CHECK (
                    "type" IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET')
                ),
                CONSTRAINT "PK_dd68b4d63103d0edf963706472a" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_auth_action_tokens_user_type" ON "auth_action_tokens" ("userId", "type")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_auth_action_tokens_token_hash" ON "auth_action_tokens" ("tokenHash")
        `);
    // ---------------------------------------------
    // Sessões autenticadas
    // ---------------------------------------------
    await queryRunner.query(`
            CREATE TABLE "auth_sessions" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "userId" uuid NOT NULL,
                "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
                "revokedAt" TIMESTAMP WITH TIME ZONE,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "lastUsedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_641507381f32580e8479efc36cd" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_auth_sessions_user_id" ON "auth_sessions" ("userId")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_auth_sessions_active_user" ON "auth_sessions" ("userId") WHERE "revokedAt" IS NULL
        `);
    // ---------------------------------------------
    // Cadeia de rotação dos refresh tokens
    // ---------------------------------------------
    await queryRunner.query(`
            CREATE TABLE "refresh_tokens" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "sessionId" uuid NOT NULL,
                "tokenHash" character(64) NOT NULL,
                "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
                "usedAt" TIMESTAMP WITH TIME ZONE,
                "revokedAt" TIMESTAMP WITH TIME ZONE,
                "replacedByTokenId" uuid,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_refresh_tokens_session_id" ON "refresh_tokens" ("sessionId")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_refresh_tokens_token_hash" ON "refresh_tokens" ("tokenHash")
        `);
    // ---------------------------------------------
    // Integridade referencial da autenticação
    // ---------------------------------------------
    await queryRunner.query(`
            ALTER TABLE "auth_action_tokens"
            ADD CONSTRAINT "FK_89417bcf63ea9df4edded65aee2" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "auth_sessions"
            ADD CONSTRAINT "FK_925b24d7fc2f9324ce972aee025" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "refresh_tokens"
            ADD CONSTRAINT "FK_b25a58a00578bd1b7a01623d2dd" FOREIGN KEY ("sessionId") REFERENCES "auth_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "refresh_tokens"
            ADD CONSTRAINT "FK_6077443266dc1dde0ac43b6f727" FOREIGN KEY ("replacedByTokenId") REFERENCES "refresh_tokens"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    // ---------------------------------------------
    // Isolamento das tabelas sensíveis
    // ---------------------------------------------
    await queryRunner.query(`ALTER TABLE "users" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(
      `ALTER TABLE "auth_sessions" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "auth_action_tokens" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`
            REVOKE ALL ON TABLE "users", "auth_sessions", "refresh_tokens", "auth_action_tokens" FROM PUBLIC
        `);
    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    REVOKE ALL ON TABLE "users", "auth_sessions", "refresh_tokens", "auth_action_tokens" FROM anon;
                END IF;
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    REVOKE ALL ON TABLE "users", "auth_sessions", "refresh_tokens", "auth_action_tokens" FROM authenticated;
                END IF;
            END
            $$
        `);
  }

  // ---------------------------------------------
  // Remoção da estrutura de autenticação
  // Chaves, índices e tabelas saem em ordem inversa da criação, para não
  // deixar nenhuma dependência apontando para um objeto já removido.
  // ---------------------------------------------
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_6077443266dc1dde0ac43b6f727"
        `);
    await queryRunner.query(`
            ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_b25a58a00578bd1b7a01623d2dd"
        `);
    await queryRunner.query(`
            ALTER TABLE "auth_sessions" DROP CONSTRAINT "FK_925b24d7fc2f9324ce972aee025"
        `);
    await queryRunner.query(`
            ALTER TABLE "auth_action_tokens" DROP CONSTRAINT "FK_89417bcf63ea9df4edded65aee2"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."UQ_refresh_tokens_token_hash"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_refresh_tokens_session_id"
        `);
    await queryRunner.query(`
            DROP TABLE "refresh_tokens"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_auth_sessions_user_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_auth_sessions_active_user"
        `);
    await queryRunner.query(`
            DROP TABLE "auth_sessions"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."UQ_auth_action_tokens_token_hash"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_auth_action_tokens_user_type"
        `);
    await queryRunner.query(`
            DROP TABLE "auth_action_tokens"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."UQ_users_email"
        `);
    await queryRunner.query(`
            DROP TABLE "users"
        `);
  }
}
