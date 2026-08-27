# Autenticação JWT pública com sessões revogáveis

**Data:** 2026-08-26  
**Subprojeto:** 3 de 5 (Validação → Persistência → **JWT** → Autorização → Frontend)

## Contexto

A API NestJS já valida entradas e persiste `categories`, `products`, `orders`
e `order_items` em Postgres/Supabase via TypeORM. Nenhuma rota possui
autenticação. O Supabase continua sendo usado somente como Postgres; a
autenticação será implementada dentro do NestJS para ensinar cadastro, hash de
senha, JWT, guards, sessões e recuperação de conta.

As rotas de negócio permanecerão públicas até o subprojeto 4, que adicionará
autorização e ownership. Portanto, concluir este design não autoriza publicar a
API inteira na internet.

## Objetivos

- Cadastrar usuário com email e senha sem expor existência de contas.
- Exigir verificação de email antes do primeiro login.
- Emitir access token JWT curto e refresh token opaco rotativo.
- Revogar imediatamente sessões em logout, reset de senha ou reutilização de
  refresh token.
- Recuperar senha por token de uso único enviado pelo Resend.
- Proteger `GET /auth/me` como prova do guard JWT.
- Resistir a força bruta, enumeração, replay e condições de corrida.
- Incluir testes automatizados para os fluxos de autenticação.

## Fora de escopo

- Supabase Auth.
- Roles, autorização e ownership de recursos.
- Proteção de `categories`, `products` e `orders`.
- MFA/WebAuthn, alteração de email e exclusão de conta.
- Frontend.
- Fila/outbox persistente de email nesta primeira versão.
- Refresh token com sessão deslizante infinita.

## Critérios de sucesso

- Senhas nunca são persistidas ou registradas em texto puro.
- Usuário não verificado não consegue autenticar.
- Logout invalida imediatamente access e refresh tokens da sessão.
- Dois refreshes concorrentes com o mesmo token não criam duas sessões válidas.
- Reutilizar um refresh token consumido revoga a sessão inteira.
- Reset de senha revoga todas as sessões do usuário.
- Tokens de email são de uso único e armazenados somente como hash.
- Respostas de cadastro, reenvio e recuperação não confirmam se o email existe.
- Novas tabelas permanecem inacessíveis aos roles `anon` e `authenticated` do
  Supabase.
- Type-check, formatação, testes automatizados e testes REST adversariais passam.

## Arquitetura

### `UsersModule`

Possui a entidade `User` e operações internas de busca/criação/atualização. Não
expõe controller. `passwordHash` nunca faz parte de respostas públicas.

### `AuthModule`

Possui controller, service, DTOs, hash de senha, consulta ao Pwned Passwords,
emissão/validação JWT, strategy, guard, sessões, refresh tokens, action tokens,
cookies, bloqueio por conta e eventos de segurança.

### `EmailModule`

Expõe um contrato interno de email e uma implementação com Resend. O
`AuthService` não importa o SDK do Resend diretamente. Os testes substituem o
adapter por um fake; nenhuma suíte automatizada envia email real.

## Modelo de dados

Todas as tabelas usam UUID como chave primária, timestamps com timezone, RLS
habilitado e `REVOKE ALL` para `anon`/`authenticated`.

### `users`

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | PK |
| `email` | text/varchar | normalizado em minúsculas, único |
| `passwordHash` | text | Argon2id, `select: false` |
| `emailVerifiedAt` | timestamptz nullable | nulo enquanto pendente |
| `failedLoginAttempts` | integer | default 0, não negativo |
| `lockedUntil` | timestamptz nullable | bloqueio temporário |
| `createdAt` | timestamptz | gerado pelo banco |
| `updatedAt` | timestamptz | atualizado pelo ORM |

### `auth_sessions`

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | PK e claim `sid` |
| `userId` | uuid | FK indexada para `users` |
| `expiresAt` | timestamptz | limite absoluto de 30 dias |
| `revokedAt` | timestamptz nullable | sessão inválida quando preenchido |
| `createdAt` | timestamptz | criação |
| `lastUsedAt` | timestamptz | última renovação |

### `refresh_tokens`

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | PK |
| `sessionId` | uuid | FK indexada para `auth_sessions` |
| `tokenHash` | char(64) | SHA-256 hexadecimal, único |
| `expiresAt` | timestamptz | nunca ultrapassa a sessão |
| `usedAt` | timestamptz nullable | preenchido na rotação |
| `revokedAt` | timestamptz nullable | revogação explícita |
| `replacedByTokenId` | uuid nullable | próxima geração |
| `createdAt` | timestamptz | criação |

### `auth_action_tokens`

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | PK |
| `userId` | uuid | FK indexada para `users` |
| `type` | enum/text | `EMAIL_VERIFICATION` ou `PASSWORD_RESET` |
| `tokenHash` | char(64) | SHA-256 hexadecimal, único |
| `expiresAt` | timestamptz | 24 h para verificação; 15 min para reset |
| `usedAt` | timestamptz nullable | uso único |
| `createdAt` | timestamptz | criação |

Índices adicionais cobrem `(userId, type)`, `sessionId`, `tokenHash` e buscas de
sessões ativas. FKs devem declarar o comportamento de exclusão explicitamente.

## Contrato HTTP

### `POST /auth/register`

Entrada: `{ email, password }`. Retorna `202` e mensagem genérica. Uma conta
nova fica pendente; uma conta pendente pode receber nova verificação respeitando
cooldown; uma conta já verificada não é alterada.

### `POST /auth/verify-email`

Entrada: `{ token }`. Retorna `204`. Token inválido, expirado ou utilizado
retorna `400` genérico.

### `POST /auth/resend-verification`

Entrada: `{ email }`. Retorna `202` genérico em todos os casos válidos no
formato do DTO.

### `POST /auth/login`

Entrada: `{ email, password }`. Retorna `200`, define refresh cookie e responde:

```json
{
  "accessToken": "...",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "user": {
    "id": "uuid",
    "email": "usuario@example.com",
    "isEmailVerified": true,
    "createdAt": "2026-08-26T00:00:00.000Z"
  }
}
```

Email inexistente, senha incorreta, conta bloqueada e falhas equivalentes usam
o mesmo `401`. Senha correta para conta pendente retorna `403` com orientação
para verificar o email.

### `POST /auth/refresh`

Lê o refresh cookie, rotaciona-o em transação e retorna o mesmo contrato de
sessão do login. Token inválido ou reutilizado retorna `401` e limpa o cookie.

### `POST /auth/logout`

Revoga a sessão associada ao cookie, limpa o cookie e retorna `204`. É
idempotente para cookies ausentes ou já inválidos.

### `GET /auth/me`

Exige Bearer access token e retorna apenas o usuário público.

### `POST /auth/forgot-password`

Entrada: `{ email }`. Retorna `202` genérico. Somente conta existente,
verificada e fora do cooldown recebe email.

### `POST /auth/reset-password`

Entrada: `{ token, newPassword }`. Valida política/HIBP, troca o hash, consome o
token e revoga todas as sessões na mesma transação. Retorna `204`.

## Senhas

- Argon2id com mínimo inicial de 19 MiB, 2 iterações e paralelismo 1.
- Mínimo de 15 e máximo de 128 caracteres.
- Espaços, Unicode e frases-senha são aceitos.
- Sem regras artificiais de composição e sem troca periódica.
- A senha não sofre `trim`.
- Email sofre `trim` e normalização para minúsculas.

### Senhas comprometidas

Cadastro e reset consultam o Pwned Passwords Range API:

1. Calculam SHA-1 da senha apenas em memória.
2. Enviam somente os cinco primeiros caracteres do hash.
3. Usam `Add-Padding: true`.
4. Comparam os sufixos localmente.
5. Rejeitam qualquer correspondência com contagem maior que zero.
6. Se o serviço estiver indisponível, retornam `503` sem aceitar a senha.

O SHA-1 nunca é persistido e não substitui Argon2id. O timeout externo deve ser
curto e configurado; erros não podem incluir senha ou hash em logs.

## Tokens e sessões

### Access token

- JWT HS256, 15 minutos.
- Segredo aleatório com pelo menos 256 bits.
- Claims: `sub`, `sid`, `iss`, `aud`, `iat`, `exp`.
- Algoritmo, issuer e audience validados explicitamente.
- Strategy carrega usuário e sessão ativa; indisponibilidade falha fechada.
- Nenhum dado sensível no payload.

### Refresh token

- 256 bits de CSPRNG, base64url.
- Valor puro somente no cookie; banco guarda SHA-256.
- Sessão absoluta de 30 dias, sem extensão infinita.
- Cada uso rotaciona o token sob lock pessimista.
- Reutilização revoga a sessão inteira.
- Refreshes concorrentes deliberadamente podem revogar a sessão; o frontend
  futuro deve implementar single-flight para renovação.

### Cookie

- `HttpOnly`, host-only, `SameSite=Strict`, `Path=/auth`.
- `Secure` obrigatório fora de desenvolvimento.
- `Max-Age` alinhado ao vencimento absoluto.
- Nunca retornar refresh token em JSON.
- Login, refresh e logout validam `Origin` em produção.
- CORS futuro usa allowlist exata e `credentials: true`, nunca wildcard.

## Email

- Resend via `RESEND_API_KEY` e remetente configurável.
- `onboarding@resend.dev` serve apenas ao desenvolvimento e ao endereço da
  própria conta Resend.
- Produção exige domínio próprio com SPF, DKIM e DMARC.
- Links usam `FRONTEND_URL/verify-email#token=...` e
  `FRONTEND_URL/reset-password#token=...`.
- O frontend futuro posta o token no corpo e remove o fragmento com
  `history.replaceState`.
- Sem frontend, o token é copiado manualmente para o cliente REST.

O envio ocorre fora de transações do banco. Falha do Resend mantém a conta
pendente e permite reenvio. Timeouts/erros são sanitizados. Uma outbox fica
adiada até haver volume, múltiplas instâncias ou exigência maior de entrega.

## Enumeração e abuso

- Cadastro, reenvio e recuperação retornam a mesma mensagem genérica.
- Login de email inexistente executa Argon2id contra um hash fictício.
- Cadastro executa trabalho criptográfico equivalente mesmo em duplicatas.
- Respostas sensíveis aplicam duração mínima configurada sem registrar dados.
- `Cache-Control: no-store` em respostas de autenticação.
- `helmet` habilita headers seguros.

Limites iniciais, centralizados em configuração:

- login: 10 requisições/minuto/IP;
- conta: 5 falhas consecutivas → bloqueio de 15 minutos;
- cadastro: 5 requisições/15 minutos/IP;
- reenvio: 3 requisições/hora/IP e cooldown de 5 minutos por conta;
- recuperação: 3 requisições/hora/IP e um email por token vigente;
- refresh: 30 requisições/minuto/IP.

O storage em memória do throttler é aceito apenas para uma instância. Múltiplas
réplicas exigem storage compartilhado antes do lançamento.

## Concorrência e transações

- Unicidade do email é garantida pelo banco, não por check-then-insert.
- Incremento/reset de falhas usa update atômico ou lock da linha do usuário.
- Verificação e reset bloqueiam o action token antes de consumi-lo.
- Refresh bloqueia token e sessão antes de rotacionar.
- Reset altera senha, consome token e revoga sessões atomicamente.
- Chamadas ao Resend e ao HIBP nunca mantêm transação do banco aberta.

## Configuração

Variáveis esperadas, sempre com placeholders em `.env.example`:

```env
DATABASE_URL=postgresql://user:password@host:5432/postgres
JWT_SECRET=replace-with-at-least-32-random-bytes
JWT_ISSUER=projeto-test-api
JWT_AUDIENCE=projeto-test-frontend
RESEND_API_KEY=re_placeholder
EMAIL_FROM="Marketplace <onboarding@resend.dev>"
FRONTEND_URL=http://localhost:3001
NODE_ENV=development
```

Configuração ausente ou insegura falha durante o boot. Nenhum segredo possui
fallback hardcoded.

## Logging

Registrar eventos de login, bloqueio, logout, reutilização, reset, verificação e
falha de entrega usando IDs internos, timestamp e correlation ID. Nunca registrar
senha, hashes, JWT, cookies, action tokens, API keys ou corpo completo da
requisição.

## Testes

Este subprojeto abre uma exceção explícita à convenção anterior e adiciona testes
automatizados. Unit tests cobrem componentes puros e services com dependências
fakes. Integração/E2E usa Postgres isolado por `TEST_DATABASE_URL`; a suíte deve
recusar execução se o valor for igual a `DATABASE_URL`.

HIBP e Resend são simulados nos testes automatizados. Cenários obrigatórios:

- cadastro novo, duplicado e concorrente;
- política de senha e indisponibilidade do HIBP;
- verificação válida, expirada, usada e concorrente;
- login válido, inválido, pendente, bloqueado e concorrente;
- JWT alterado, expirado e com issuer/audience inválidos;
- refresh válido, concorrente e reutilizado;
- logout e rejeição imediata do access token anterior;
- reset válido, expirado, usado e com revogação total;
- cookies, headers, rate limiting, RLS e ausência de campos sensíveis.

## Alternativas consideradas

### Access JWT completamente stateless

Mais simples e sem consulta por request, mas logout/reset deixariam o access
token válido por até 15 minutos. Rejeitado em favor de revogação imediata.

### Supabase Auth

Reduz implementação própria, mas contraria o objetivo pedagógico aprovado.

### Email outbox

Melhora retry e isolamento do Resend, mas exige worker, deduplicação e política
operacional. Adiada, não descartada.

### MFA nesta etapa

Melhora resistência a phishing, mas expande cadastro, recuperação e suporte.
Adiado para evolução futura.

## Gates de publicação

- Subprojeto 4 concluído, com proteção e ownership das rotas de negócio.
- Domínio Resend verificado com SPF, DKIM e DMARC.
- HTTPS, CORS e allowlist de Origin configurados.
- Segredos em secret manager e chave anteriormente exposta revogada.
- Role PostgreSQL dedicado com privilégio mínimo; não usar role administrador.
- Storage compartilhado de rate limit se houver múltiplas instâncias.
- Testes automatizados, testes adversariais e `npm audit` aprovados.
