# Autenticação JWT pública — plano de implementação

**Data:** 2026-08-26  
**Spec:** `docs/superpowers/specs/2026-08-26-autenticacao-jwt-design.md`  
**ADR:** `docs/decisions/0001-autenticacao-jwt-manual.md`

## Objetivo

Implementar o subprojeto 3 de autenticação no NestJS, com cadastro e email
verificado, access JWT curto, sessão persistida, refresh opaco rotativo,
logout revogável e recuperação de senha. O Supabase continua sendo somente o
Postgres. As rotas de negócio permanecem públicas até o subprojeto 4.

## Regras de execução

- TDD em cada comportamento: escrever o teste, confirmar a falha esperada,
  implementar o mínimo, confirmar o verde e só então refatorar.
- Entregar em fatias pequenas; após cada fatia, rodar o teste focal e o
  type-check.
- Não criar repositórios customizados; usar `Repository<Entity>`/`manager` do
  TypeORM.
- `synchronize: false` sempre. Revisar a migration antes de aplicar.
- Não imprimir `.env`, tokens, hashes, JWTs, cookies ou chaves.
- Resend e HIBP ficam mockados em testes automatizados.
- E2E só roda com `TEST_DATABASE_URL` isolada e recusa valor igual a
  `DATABASE_URL`.
- Nenhuma conclusão desta etapa autoriza publicar `categories`, `products` ou
  `orders` sem o subprojeto 4.

## Fase 0 — descoberta documental concluída

### NestJS e HTTP

Fontes oficiais consultadas:

- https://docs.nestjs.com/security/authentication
- https://docs.nestjs.com/recipes/passport
- https://github.com/nestjs/jwt
- https://github.com/mikenicholson/passport-jwt
- https://docs.nestjs.com/techniques/configuration
- https://docs.nestjs.com/security/rate-limiting
- https://docs.nestjs.com/techniques/cookies
- https://docs.nestjs.com/security/helmet
- https://docs.nestjs.com/security/cors

APIs fixadas: `JwtModule.registerAsync`, `JwtService.signAsync`,
`PassportStrategy(Strategy)`, `ExtractJwt.fromAuthHeaderAsBearerToken`,
`@Throttle({ default: { limit, ttl } })`, `ThrottlerGuard`, `response.cookie`
e `response.clearCookie`. Algoritmo, issuer e audience serão explícitos.

### Criptografia e serviços externos

Fontes oficiais consultadas:

- https://github.com/ranisalt/node-argon2
- https://resend.com/docs/send-with-nodejs
- https://resend.com/docs/api-reference/emails/send-email
- https://nodejs.org/api/crypto.html
- https://haveibeenpwned.com/API/v3#PwnedPasswords

APIs fixadas: Argon2id com `memoryCost: 19456`, `timeCost: 2`,
`parallelism: 1`; `randomBytes(32).toString('base64url')`; SHA-256 hexadecimal;
Resend com idempotency key; HIBP range com `Add-Padding: true` e timeout.

### TypeORM/Postgres/Supabase

Fontes oficiais consultadas:

- https://typeorm.io/docs/transactions/
- https://typeorm.io/docs/query-builder/select-query-builder/
- https://typeorm.io/docs/entity/entities/
- https://www.postgresql.org/docs/current/ddl-constraints.html
- https://www.postgresql.org/docs/current/explicit-locking.html
- https://supabase.com/changelog.md

APIs fixadas: callback `manager.transaction`, `pessimistic_write` dentro da
transação, `select: false` + `addSelect`, SQLSTATE `23505`, UUID e constraints
explícitas. O changelog não mostrou quebra para tabelas novas em `public`; não
usar schemas internos do Supabase.

Lacunas operacionais aceitas: não há Docker nem `TEST_DATABASE_URL`; domínio
Resend, proxy e storage compartilhado de throttle continuam gates de produção.

## Fase 1 — dependências, ambiente e bootstrap seguro

### Arquivos

- Modificar: `package.json`, `package-lock.json`
- Modificar: `.env.example`
- Criar: `src/config/env.validation.ts`
- Criar: `src/config/env.validation.spec.ts`
- Criar: `src/config/configure-app.ts`
- Modificar: `src/db/data-source.ts`
- Criar: `src/db/data-source.spec.ts`
- Modificar: `src/app.module.ts`, `src/main.ts`
- Modificar: `test/app.e2e-spec.ts`

### Passos e gates

1. Instalar versões compatíveis de JWT/Passport, Argon2, Resend, Throttler,
   Helmet e cookie-parser, incluindo tipos de desenvolvimento.
2. RED: testar validação de segredo menor que 32 bytes, URL inválida, campos
   ausentes e configuração válida.
3. GREEN: implementar `validateEnvironment` síncrona e conectá-la ao
   `ConfigModule.forRoot({ isGlobal: true, cache: true, validate })`.
4. RED: provar que ambiente `test` sem banco isolado ou apontando ao banco real
   é recusado.
5. GREEN: extrair `createDataSourceOptions(env)`; manter
   `synchronize: false`, usar `TEST_DATABASE_URL` somente em teste e configurar
   UUID com `pgcrypto` após revisar o suporte local.
6. Extrair `configureApp(app)` para que bootstrap real e E2E compartilhem
   ValidationPipe, Helmet, cookie-parser e CORS exato.
7. Verificar: testes focais, `tsc --noEmit`, sem leitura de valores de `.env`.

## Fase 2 — primitivas criptográficas e email

### Arquivos

- Criar: `src/modules/auth/services/opaque-token.service.ts`
- Criar: `src/modules/auth/services/opaque-token.service.spec.ts`
- Criar: `src/modules/auth/services/pwned-passwords.service.ts`
- Criar: `src/modules/auth/services/pwned-passwords.service.spec.ts`
- Criar: `src/modules/auth/services/password.service.ts`
- Criar: `src/modules/auth/services/password.service.spec.ts`
- Criar: `src/modules/email/email.service.ts`
- Criar: `src/modules/email/resend-email.service.ts`
- Criar: `src/modules/email/resend-email.service.spec.ts`
- Criar: `src/modules/email/email.module.ts`

### Passos e gates

1. RED/GREEN: token opaco tem 256 bits, 43 caracteres base64url e hash SHA-256
   de 64 caracteres; somente o hash é destinado ao banco.
2. RED/GREEN: HIBP envia só cinco caracteres SHA-1, usa padding, interpreta
   contagem e falha fechada com `503` em timeout/rede/non-200.
3. RED/GREEN: senha preserva espaços, aceita 15–128 caracteres, rejeita senha
   comprometida e usa Argon2id com parâmetros aprovados.
4. RED/GREEN: adapter Resend usa remetente/configuração, links com fragmento,
   idempotency key do action token e não vaza erro bruto.
5. Verificar focais + type-check.

## Fase 3 — schema de autenticação

### Arquivos

- Criar: `src/modules/users/entities/user.entity.ts`
- Criar: `src/modules/users/users.service.ts`
- Criar: `src/modules/users/users.module.ts`
- Criar: `src/modules/auth/entities/auth-session.entity.ts`
- Criar: `src/modules/auth/entities/refresh-token.entity.ts`
- Criar: `src/modules/auth/entities/auth-action-token.entity.ts`
- Criar: `src/db/migrations/<timestamp>-CreateAuthTables.ts`
- Criar: teste estrutural/integrado da migration quando houver banco isolado

### Passos e gates

1. Modelar as quatro tabelas da spec com UUID, `timestamptz`, `select: false`,
   constraints e FKs explícitas.
2. Ordem: `users` → `auth_sessions` → `refresh_tokens` →
   `auth_action_tokens`; `down` na ordem inversa.
3. Gerar primeiro com `--dryrun`; revisar UUID, nomes, índices, checks e FKs.
4. Garantir RLS e `REVOKE ALL` para `anon`/`authenticated`, com SQL seguro para
   banco de teste que não tenha esses roles.
5. Não usar índice temporal com `now()`; usar índices por email, usuário,
   sessão, tipo e hashes.
6. Aplicar no Supabase de desenvolvimento somente após a revisão do SQL.
7. Verificar migration show/run, metadata/boot e type-check.

## Fase 4 — cadastro e verificação de email

### Arquivos

- Criar: DTOs `register`, `verify-email`, `resend-verification`
- Criar: `src/modules/auth/auth.service.ts`
- Criar: `src/modules/auth/auth.service.spec.ts`
- Criar: `src/modules/auth/auth.controller.ts`
- Criar: `src/modules/auth/auth.controller.spec.ts`
- Criar: `src/modules/auth/auth.module.ts`
- Modificar: `src/app.module.ts`

### Passos e gates

1. RED: DTO normaliza email, mas não aplica trim à senha; payload extra falha.
2. RED: cadastro novo retorna genérico e persiste apenas Argon2/action hash;
   duplicata verificada não muda; pendente respeita cooldown; corrida é
   resolvida pela unique constraint `UQ_users_email`/SQLSTATE `23505`.
3. GREEN: emissão do token ocorre na transação e envio Resend fora dela.
4. RED/GREEN: verificação usa lock pessimista, consome uma vez e retorna erro
   genérico para inválido/expirado/usado.
5. RED/GREEN: reenvio invalida token anterior após cooldown sem enumerar conta.
6. Verificar respostas 202/204, ausência de hashes e testes concorrentes com
   banco isolado quando disponível.

## Fase 5 — login, JWT, sessão, refresh e logout

### Arquivos

- Criar: DTO `login`
- Criar: `src/modules/auth/strategies/jwt.strategy.ts`
- Criar: `src/modules/auth/guards/jwt-auth.guard.ts`
- Criar: `src/modules/auth/guards/origin.guard.ts`
- Criar: `src/modules/auth/guards/origin.guard.spec.ts`
- Criar: `src/modules/auth/interceptors/no-store.interceptor.ts`
- Criar: `src/modules/auth/decorators/current-user.decorator.ts`
- Criar/ajustar: services e testes de auth/sessão

### Passos e gates

1. RED/GREEN: login inexistente executa dummy Argon2; senha errada e bloqueio
   retornam o mesmo `401`; cinco falhas bloqueiam por 15 min sob lock; senha
   correta em conta pendente retorna `403`.
2. RED/GREEN: login válido cria sessão absoluta de 30 dias, refresh opaco
   hasheado e access JWT de 15 min com `sub/sid/iss/aud`.
3. RED/GREEN: strategy exige HS256, issuer/audience e sessão ativa; `/auth/me`
   nunca retorna `passwordHash`.
4. RED/GREEN: refresh trava token/sessão, rotaciona uma vez e reuse detection
   revoga a sessão. Não lançar dentro da transação antes de persistir revogação.
5. RED/GREEN: logout é idempotente e revoga sessão para qualquer geração de
   refresh reconhecida.
6. Cookie host-only: HttpOnly, Strict, `/auth`, Secure fora de desenvolvimento,
   duração alinhada à sessão; nunca em JSON.
7. Origin guard exato em produção para login/refresh/logout.
8. Aplicar `Cache-Control: no-store` ao controller.

## Fase 6 — recuperação, throttling e hardening

### Arquivos

- Criar: DTOs `forgot-password` e `reset-password`
- Modificar: auth service/controller/testes
- Modificar: `src/app.module.ts`
- Modificar: `.env.example`

### Passos e gates

1. RED/GREEN: forgot retorna 202 genérico e não reenvia enquanto houver token
   ativo.
2. RED/GREEN: reset valida HIBP/Argon fora da transação; dentro dela trava e
   consome action token, troca senha e revoga todas as sessões atomicamente.
3. Registrar Throttler global e limites por endpoint com a sintaxe v6 e TTL em
   milissegundos.
4. Confirmar Helmet, CORS sem wildcard, cookies e ausência de cache.
5. Adicionar mensagens genéricas e logs sanitizados sem corpos/segredos.

## Fase 7 — verificação adversarial e handoff

1. Rodar testes unitários focais após cada slice e a suíte completa ao final.
2. Rodar `npx.cmd tsc -p tsconfig.build.json --noEmit`.
3. Rodar ESLint sem correção automática, Prettier e build.
4. Rodar `npm.cmd audit` e classificar achados; não aplicar `--force`.
5. Se `TEST_DATABASE_URL` existir e for isolada, rodar E2E e cenários de
   concorrência; se não existir, registrar explicitamente o gate não executado.
6. Fazer revisão adversarial do diff para autenticação, trust boundaries,
   enumeração, replay, corrida, rollback, logs e configuração.
7. Atualizar `.claude/handoff-context.md` e `.claude/handoff-latest.md` com 100%
   dos objetivos, decisões, arquivos, migration, testes, comandos, limitações e
   próximo passo. Não incluir chaves nem tokens.

## Definição de pronto

- Endpoints da spec implementados e tipados.
- Unit tests verdes; E2E verde quando houver Postgres isolado.
- Migration revisada, reversível e aplicada apenas ao ambiente autorizado.
- Nenhum segredo ou token exposto em código, saída, logs ou documentação.
- Handoff do Claude atualizado e coerente com a exceção de testes aprovada.
- O relatório final distingue claramente “auth pronta” de “API inteira pronta
  para público”.
