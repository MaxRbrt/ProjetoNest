# Auditoria — schema/migration/RLS/config de bootstrap (módulo auth JWT)

Data: 2026-08-26

## Achado: migration `CreateAuthTables1787761623204` ainda NÃO foi aplicada no banco real

**Severidade:** High
**Confiança:** Alta
**Verificado como:** Script Node temporário (`audit-db-temp.ts`, apagado ao final) conectou usando `createDataSourceOptions` de `src/db/data-source.ts` (lê `.env` via dotenv, connection string nunca impressa) e consultou o banco real:

- `SELECT * FROM migrations ORDER BY timestamp` retornou apenas 4 linhas: `CreateCategories1787679353968`, `CreateProducts1787679693383`, `CreateOrders1787741065822`, `EnableRls1787743956010`. **`CreateAuthTables1787761623204` não aparece.**
- `information_schema.tables` filtrando `table_name IN ('users','auth_sessions','refresh_tokens','auth_action_tokens')` retornou **0 linhas** — as tabelas não existem no banco.
- `pg_class.relrowsecurity` para todas as tabelas do schema `public` (`relkind='r'`) lista somente as 5 tabelas antigas (`categories`, `migrations`, `order_items`, `orders`, `products`), todas com `relrowsecurity = true` (RLS ligado, consistente com a migration `EnableRls` já aplicada).
- `information_schema.role_table_grants` para `grantee IN ('anon','authenticated')` retornou **0 linhas** — confirma que as 5 tabelas antigas continuam sem grants para esses roles (proteção anterior intacta).

**Impacto:** Estado do arquivo de migration diverge do estado do banco. Isso não é uma exposição de dados por si só (as tabelas nem existem ainda para vazar via Data API), mas significa que:
1. O código da aplicação (entidades `User`, `AuthSession`, `RefreshToken`, `AuthActionToken`, e todo `AuthModule`) vai falhar em runtime com `relation "users" does not exist" assim que qualquer endpoint de auth for chamado contra este banco.
2. **Não há garantia de que, quando a migration for rodada, ela realmente será aplicada em produção antes do deploy do código novo** — é o tipo de gap que historicamente já causou o incidente de RLS desligado neste projeto (a migration `EnableRls` corrigindo um estado que ficou exposto por um tempo). Mesmo risco de janela de exposição se o deploy da aplicação ocorrer antes de `npm run migration:run`.
3. Não dá para confirmar neste momento se, uma vez aplicada, a migration realmente resulta no estado esperado no Supabase real (ela foi apenas lida estaticamente até aqui) — validação abaixo é sobre o arquivo, não sobre o banco pós-aplicação.

**Correção:** Rodar `npm run migration:run` contra o banco de destino antes (ou como parte atômica do) do deploy do `AuthModule`; adicionar um passo de CI/deploy que falhe o pipeline se `migration:run` não tiver sucesso antes do app subir. Considerar um smoke-test pós-deploy que verifique `relrowsecurity=true` nas 4 tabelas novas e grants vazios para `anon`/`authenticated`, para pegar regressão automaticamente (o mesmo tipo de script usado nesta auditoria).

---

## Revisão do arquivo de migration (estado no repo, ainda não confirmado no banco pós-apply)

Categoria limpa — arquivo `src/db/migrations/1787761623204-CreateAuthTables.ts` já contém, no `up()`:
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` para as 4 tabelas novas (`users`, `auth_sessions`, `refresh_tokens`, `auth_action_tokens`).
- `REVOKE ALL ON TABLE ... FROM PUBLIC` e, condicionalmente (`IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon'/'authenticated')`), `REVOKE ALL ... FROM anon` e `FROM authenticated`.
- Isso é estruturalmente equivalente (na verdade mais defensivo, por checar existência do role) ao padrão usado em `EnableRls1787743956010`, que já provou corrigir o problema anterior. **Assumindo que a migration seja executada sem erro, o resultado esperado é RLS ligado + zero grants para anon/authenticated nas 4 tabelas novas — mesmo tratamento das 5 tabelas antigas.** Isso não pôde ser confirmado no banco real porque a migration não foi aplicada (ver achado acima).

Categoria limpa — unicidade: `UQ_users_email` (único), `UQ_auth_action_tokens_token_hash` (único), `UQ_refresh_tokens_token_hash` (único) — todos criados como `CREATE UNIQUE INDEX`, batendo com `@Index(..., {unique: true})` nas entidades correspondentes.

Categoria limpa — índices em FK/busca: `IDX_auth_action_tokens_user_type (userId, type)`, `IDX_auth_sessions_user_id (userId)`, `IDX_auth_sessions_active_user (userId) WHERE revokedAt IS NULL`, `IDX_refresh_tokens_session_id (sessionId)`. `tokenHash` em ambas as tabelas de token tem índice único (evita full scan em validação de refresh/reset token, e garante unicidade). Todas as FKs (`auth_action_tokens.userId`, `auth_sessions.userId`, `refresh_tokens.sessionId`, `refresh_tokens.replacedByTokenId`) têm índice correspondente.

Categoria limpa — tipos: `email` é `varchar(254)` com `CHECK ("email" = lower(btrim("email")))` forçando normalização a nível de banco (não só aplicação) — bom padrão contra bypass de duplicidade por case/espaço. `passwordHash` é `text`. Todos os timestamps são `TIMESTAMP WITH TIME ZONE` (timestamptz). `tokenHash` é `character(64)` (hash hex de sha-256, por exemplo) em ambas as tabelas de token.

## Achado: `down()` da migration não reverte RLS/REVOKE antes de derrubar as tabelas (mas isso é inofensivo)

**Severidade:** Low
**Confiança:** Alta
**Verificado como:** leitura de `down()` em `1787761623204-CreateAuthTables.ts` (linhas 126-172): remove FKs, índices e tabelas em ordem correta (`refresh_tokens` → `auth_sessions` → `auth_action_tokens` → `users`, filhos antes de pais, respeitando as dependências de FK), mas nunca executa `DISABLE ROW LEVEL SECURITY` nem `GRANT ALL ... TO anon, authenticated` (diferente do `down()` de `EnableRls1787743956010`, que faz `GRANT ALL` antes de `DISABLE ROW LEVEL SECURITY`).
**Impacto:** Nenhum de fato — `DROP TABLE` remove a tabela inteira, então revogar/reabilitar RLS antes é redundante para uma migration cujo único propósito do `down` é desfazer a criação. Diferente do caso de `EnableRls`, onde o `down()` precisa restaurar comportamento anterior em tabelas que continuam existindo. Ordem de drop está correta (evita erro de FK).
**Correção:** Nenhuma ação necessária. Mencionado apenas para registro — não é um bug.

## Achado: entidades TypeORM batem exatamente com a migration

**Severidade:** N/A (verificação positiva)
**Confiança:** Alta
**Verificado como:** comparação linha a linha entre `src/modules/users/entities/user.entity.ts`, `src/modules/auth/entities/{refresh-token,auth-action-token,auth-session}.entity.ts` e as `CREATE TABLE` da migration.
- `passwordHash` (`User`) e `tokenHash` (`RefreshToken`, `AuthActionToken`) têm `select: false` na entidade — não retornam por padrão em queries, reduzindo risco de vazamento acidental via serialização.
- Nenhuma coluna extra na entidade que a migration não crie, e vice-versa. Tipos, nullability e defaults (`lastUsedAt` com `CURRENT_TIMESTAMP`, `failedLoginAttempts` default 0) consistentes.
- `Check` decorators nas entidades (`CHK_users_failed_login_attempts`, `CHK_users_email_normalized`, `CHK_auth_action_tokens_type`) espelham exatamente as constraints da migration.
**Impacto:** N/A — sem achado, apenas confirmação de consistência.

## Achado: validação de env e bootstrap — fail-closed correto, sem achado de severidade

**Severidade:** N/A (verificação positiva)
**Confiança:** Alta
**Verificado como:**
- `src/config/env.validation.ts`: `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, `RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_URL`, `DATABASE_URL` estão em `REQUIRED_KEYS` — ausência de qualquer um lança `Error` no boot (via `ConfigModule.forRoot({ validate: validateEnvironment })` em `src/app.module.ts`, que corre de forma síncrona no bootstrap do Nest — falha impede a aplicação de subir).
- `JWT_SECRET`: exige >= 32 bytes E rejeita valores que batem com `PLACEHOLDER_PATTERN` (`replace|placeholder|change[-_ ]?me`), incluindo o próprio valor de exemplo do `.env.example` (`replace-with-at-least-32-random-bytes` seria rejeitado em runtime real — confirmado por teste em `env.validation.spec.ts` linha 38-46).
- `RESEND_API_KEY`: exige prefixo `re_` e rejeita placeholder.
- `FRONTEND_URL`: exige HTTPS quando `NODE_ENV=production` (checado em `env.validation.spec.ts` linha 48-52).
- `src/db/database-options.ts`: `synchronize: false` fixo (hardcoded, não vem de env) — sem risco de alguém ligar synchronize via variável de ambiente. Também valida que `TEST_DATABASE_URL` é obrigatória e diferente de `DATABASE_URL` quando `NODE_ENV=test`, evitando teste rodar contra o banco de produção.
- `src/config/configure-app.ts`: `helmet()` aplicado, `cookie-parser` aplicado, `ValidationPipe` global com `whitelist + forbidNonWhitelisted + transform`. CORS configurado com `origin: [frontendOrigin]` (derivado de `new URL(FRONTEND_URL).origin`, não wildcard) e `credentials: true` — combinação seria perigosa com `origin: '*'`, mas aqui a origin é restrita a um valor único e explícito, não há wildcard.
- Todas as outras leituras de env em `AuthModule`, `EmailModule`, e serviços (`AuthService`, `AccessTokenService`, `JwtStrategy`, `PwnedPasswordsService`, `OriginGuard`, `RefreshCookieService`, `ResendEmailService`) usam `getOrThrow`, e todas as chaves usadas (`JWT_SECRET/ISSUER/AUDIENCE`, `EMAIL_FROM`, `FRONTEND_URL`, `RESEND_API_KEY`, `NODE_ENV`, `HIBP_API_URL`, `HIBP_TIMEOUT_MS`, `AUTH_MIN_RESPONSE_MS`) estão cobertas por `REQUIRED_KEYS` ou por defaults aplicados dentro de `validateEnvironment` (`HIBP_API_URL`, `HIBP_TIMEOUT_MS`, `AUTH_MIN_RESPONSE_MS`) — nenhuma chave "órfã" sem validação ou default.
**Impacto:** N/A — nenhum achado de severidade nesta área; bootstrap é fail-closed.

## Achado: `.env.example` documenta todas as novas variáveis

**Severidade:** N/A (verificação positiva)
**Confiança:** Alta
**Verificado como:** `.env.example` contém `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, `RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_URL`, `HIBP_API_URL`, `HIBP_TIMEOUT_MS`, `AUTH_MIN_RESPONSE_MS`, todos com placeholders óbvios (e o próprio `JWT_SECRET` de exemplo seria rejeitado pela validação de placeholder se usado literalmente, o que é o comportamento desejado). Nenhuma variável usada em `getOrThrow` no código ficou de fora do `.env.example`.
**Impacto:** N/A — sem achado.
