# Auditoria do subprojeto 3 (Autenticação JWT) — 2026-08-26

4 revisores em paralelo contra a implementação feita pelo Codex na branch `feat/autenticacao-jwt`.
Metodologia: leitura de código + queries diretas no Postgres real + ataques reais via curl contra o servidor rodando.

## Achado principal — HIGH: oráculo de senha no login

**Confirmado independentemente por 2 revisores** (um por leitura de código, outro por exploit ao vivo com curl).
Isso é verificação adversarial cruzada, não uma opinião só.

`src/modules/auth/auth.service.ts:153-198`

- Senha CORRETA + email não verificado → `403 "Verifique seu email antes de entrar."`
- Senha ERRADA (verificado ou não) → `401 "Email ou senha inválidos."`

A checagem de verificação de email roda DEPOIS da comparação de senha, com status/mensagem diferentes.
Um atacante testa senhas contra qualquer conta ainda não verificada e sabe exatamente quando acertou —
sem nunca precisar do email de verificação.

Ironia útil: o próprio prompt enviado ao Codex pedia para revisar isso ("Revisar se o 403 para email
pendente é aceitável após a senha correta"). Ele manteve o comportamento e não fechou o buraco.

**Correção:** retornar a MESMA resposta genérica (401) para conta não verificada, e comunicar o estado
pendente por outro canal (reenviar email de verificação automaticamente, ou só informar após o login
completo). Todos os outros endpoints (register, forgot-password, resend-verification) já fazem isso certo —
só o login destoa.

### CORRIGIDO em 2026-08-26

`src/modules/auth/auth.service.ts`:
- `LoginResult` do estado `unverified` passa a carregar o `EmailJob`
- Conta não verificada com senha correta agora reenvia a verificação (dentro da mesma transação,
  reusando `issueVerificationForUser`) e lança o MESMO `UnauthorizedException` genérico
- O envio do email é disparado sem `await` (`void this.sendVerification(...)`) depois de
  `completeAtLeast`, para não criar diferença de tempo observável entre "senha certa + não verificado"
  e "senha errada"
- Import de `ForbiddenException` removido (não usado mais)

Por que o reenvio automático: com o 401 genérico puro, o usuário legítimo que não verificou veria
"email ou senha inválidos", acharia que errou a senha, tentaria 5x e travaria a própria conta.
O reenvio dá saída a quem tem a senha certa, sem revelar nada a quem não tem.

`src/modules/auth/auth.service.spec.ts`: o teste existente afirmava o comportamento vulnerável
(`rejects.toBeInstanceOf(ForbiddenException)`) — foi reescrito para afirmar 401 + mensagem genérica,
e foi adicionado um segundo teste que verifica que senha ERRADA em conta não verificada produz
exatamente a mesma resposta. É um teste de regressão real para esse oráculo.

Verificação: `tsc --noEmit` limpo, 53/53 testes de auth passando (61/61 no conjunto auth+users+config).
**Não re-testado ao vivo** porque o `.env` ainda não tem as variáveis de auth (app não sobe).
Depois de preencher o `.env`, o teste manual que confirma é comparar as duas respostas:
```
# conta registrada e NÃO verificada
curl -i -X POST localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"email":"<a-conta>","password":"<senha CERTA>"}'
curl -i -X POST localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"email":"<a-conta>","password":"senha-errada-qualquer"}'
# as duas devem ser 401 com corpo idêntico
```

## LOW — OriginGuard só valida em produção

`src/modules/auth/guards/origin.guard.ts` — a validação de `Origin` só roda quando `NODE_ENV=production`.
Fora disso aceita qualquer origem. Mitigado por `SameSite=Strict` no cookie, mas cria dependência
de configuração correta em produção. Não explorável hoje.

## LOW — trade-offs de design (não são vulnerabilidades)

- HIBP fail-closed: se a API do HaveIBeenPwned cair, cadastro/reset de senha param. Decisão defensável
  (não deixa passar senha vazada), mas é ponto único de falha externo.
- Expiração natural do refresh token revoga a sessão inteira — mais estrito que o necessário, sem impacto de segurança.
- `down()` da migration não reverte RLS/grant antes do `DROP TABLE` — inofensivo, dropar tabela leva tudo junto.

## Estado do banco — VERIFICADO E CORRETO

Query direta no Postgres após a auditoria:

```
migrations aplicadas: CreateCategories, CreateProducts, CreateOrders, EnableRls, CreateAuthTables
9 tabelas, TODAS com relrowsecurity = true
grants para anon/authenticated: VAZIO
```

O Codex aplicou a lição do incidente anterior: a migration `CreateAuthTables` já traz
`ENABLE ROW LEVEL SECURITY` + `REVOKE` para as 4 tabelas novas, inclusive de forma mais defensiva
(checa existência do role antes de revogar).

Nota: o revisor de banco reportou HIGH ("migration não aplicada") — era verdade no momento da medição dele;
o revisor de exploit aplicou a migration em seguida para poder testar. Estado final confirmado por mim.

## Verificado e confirmado SEGURO (testes reais, não teoria)

**Dados sensíveis**
- Nenhum segredo real hardcoded em arquivo versionado (só placeholders)
- `passwordHash` com `select: false`, nunca serializado — login e `/auth/me` devolvem `PublicUser`
- Logs só com `user.id`/`actionTokenId` — nunca senha, hash, JWT ou token de ação
- Tokens de ação só no body (nunca query string); link de email usa fragmento `#token=` (não vaza em Referer/proxy)
- Nenhum arquivo novo versionado com dado sensível

**Criptografia**
- Argon2id, m=19456 t=2 p=1; hash dummy realmente executado (sem short-circuit) para email inexistente e conta bloqueada
- Token opaco: `randomBytes(32)` = 256 bits CSPRNG, armazenado como SHA-256, lookup por índice único
- JWT: `algorithms: ['HS256']` fixado nos dois lados (fecha algorithm confusion e `alg: none`),
  `issuer`/`audience` validados na verificação, payload sem PII
- `JWT_SECRET` ausente ou < 32 bytes → boot falha (fail-closed), e rejeita o valor placeholder
- HIBP com k-anonimato correto (só 5 chars do SHA-1 saem da máquina)

**Sessão e tokens (testado ao vivo)**
- JWT adulterado: assinatura alterada → 401; `alg:none` → 401; `sub` trocado → 401
- Logout revoga o access token imediatamente (strategy checa `sid` no banco)
- Reuso de refresh token revoga a sessão inteira
- 5 refreshes SIMULTÂNEOS com o mesmo cookie → só 1 passa (sem race condition — `pessimistic_write` na ordem user→session→token)
- Reset de senha mata todas as sessões abertas (testado com 2 "dispositivos")
- Tokens de verificação/reset são de uso único de verdade
- Cookie: `HttpOnly`, `SameSite=Strict`, `Path=/auth`, sem `domain`, `secure` fora de dev, nunca no corpo JSON

**Anti-enumeração e rate limiting (testado ao vivo)**
- register / forgot-password / resend-verification: resposta E timing idênticos para email existente vs inexistente
- Lockout após 5 tentativas funciona e não vaza se a senha estava certa nem se a conta existe
- Rate limit de login (10/min) ativo
- `Cache-Control: no-store` e headers do helmet presentes

**Banco**
- `tokenHash` único em `refresh_tokens` e `auth_action_tokens`; `email` único em `users`; índices em todas as FKs
- `timestamptz` em todos os timestamps; `email` normalizado por CHECK constraint
- Entidades batem exatamente com a migration
- `synchronize: false` mantido

## Pendência operacional (não é vulnerabilidade)

O `.env` atual só tem `DATABASE_URL` e `RESEND_API_KEY`. As variáveis de auth ainda não estão lá,
então o app não sobe (falha fechada no boot — comportamento correto). Antes de rodar, adicionar
conforme `.env.example`: `NODE_ENV`, `JWT_SECRET` (≥32 bytes aleatórios), `JWT_ISSUER`, `JWT_AUDIENCE`,
`EMAIL_FROM`, `FRONTEND_URL`, `HIBP_API_URL`, `HIBP_TIMEOUT_MS`, `AUTH_MIN_RESPONSE_MS`.

## Alerta de exposição de credencial

Durante a auditoria, um grep amplo de um dos revisores reimprimiu o valor real da `RESEND_API_KEY`
na saída do terminal desta sessão. Não foi para relatório nem para arquivo versionado, mas ficou no log
da sessão. **Recomendação: rotacionar a chave do Resend.** É a segunda ocorrência desse tipo —
vale mover segredos para secret manager quando o projeto sair do ambiente local.
