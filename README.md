# projeto-test — API de catálogo e pedidos

API REST de e-commerce construída com NestJS, TypeORM e PostgreSQL (Supabase).

Projeto de estudo com um objetivo específico: implementar autenticação, autorização e controle de
concorrência **por dentro**, em vez de terceirizar para serviços que escondem o funcionamento. A
autenticação é JWT manual com sessões revogáveis — não usa Supabase Auth — porque entender o
mecanismo é o ponto.

## O que está implementado

**Autenticação** — cadastro com verificação de email, login, refresh token rotativo, logout,
recuperação de senha. Senhas com Argon2id, checadas contra a base de vazamentos do Have I Been Pwned
(por k-anonymity, a senha nunca sai da aplicação). Sessões persistidas e revogáveis, rate limiting,
respostas com tempo mínimo constante para não vazar existência de conta por diferença de latência.

**Autorização** — o guard de autenticação é global: toda rota nasce protegida e `@Public()` é a
única forma de liberar, o que torna a exceção explícita e auditável. Papéis `ADMIN` e `CLIENTE` via
`@Roles()`. O papel nunca vem da requisição — só um script administrativo promove alguém.

**Catálogo** — produtos e categorias com CRUD completo. Leitura liberada a qualquer usuário
autenticado; escrita restrita a administradores. Listagens paginadas, com filtro por categoria e
busca por nome.

**Pedidos** — criação transacional com baixa de estoque sob lock pessimista, idempotência via
cabeçalho `Idempotency-Key` (um retry de rede não duplica pedido nem baixa estoque duas vezes), e
ciclo de vida `PENDENTE → PAGO → CANCELADO` com estorno de estoque no cancelamento. Cada cliente só
enxerga e altera os próprios pedidos.

## Requisitos

- Node.js 20+
- Um banco PostgreSQL (o projeto foi desenvolvido contra Supabase)
- Uma conta no [Resend](https://resend.com) para envio dos emails de verificação e recuperação

## Como rodar

```bash
npm install
cp .env.example .env    # preencha os valores reais
npm run migration:run
npm run start:dev
```

A API sobe em `http://localhost:3000` e a documentação interativa fica em
`http://localhost:3000/docs`.

### Variáveis de ambiente

A aplicação valida a configuração no boot e falha listando **todos** os problemas de uma vez, em vez
de um por inicialização.

| Variável | Obrigatória | Observação |
|---|---|---|
| `DATABASE_URL` | sim | URL PostgreSQL |
| `JWT_SECRET` | sim | mínimo de 32 bytes; placeholders são rejeitados |
| `JWT_ISSUER` | sim | emissor declarado no token |
| `JWT_AUDIENCE` | sim | audiência esperada do token |
| `RESEND_API_KEY` | sim | precisa começar com `re_` |
| `EMAIL_FROM` | sim | remetente dos emails transacionais |
| `FRONTEND_URL` | sim | origem liberada no CORS; exige HTTPS em produção |
| `NODE_ENV` | não | `development`, `test` ou `production` |
| `TEST_DATABASE_URL` | não | banco isolado para testes; precisa ser diferente de `DATABASE_URL` |
| `HIBP_API_URL` | não | padrão `https://api.pwnedpasswords.com` |
| `HIBP_TIMEOUT_MS` | não | padrão `3000` |
| `AUTH_MIN_RESPONSE_MS` | não | padrão `500` |

### Criando um administrador

A API nunca aceita `role` no cadastro. Para promover um usuário já registrado:

```bash
npm run seed:admin -- usuario@example.com
```

O comando falha de propósito na primeira execução, mostrando o banco que seria afetado. Rode de novo
com a confirmação que ele indicar:

```bash
npm run seed:admin -- usuario@example.com --confirm-target=usuario@host:5432/postgres
```

A confirmação inclui usuário e porta, não apenas host e banco: o pooler do Supabase compartilha o
mesmo host entre projetos diferentes, e host sozinho não identifica o destino.

## Endpoints

Documentação completa e navegável em `/docs` (desligada quando `NODE_ENV=production`).

| Método | Rota | Acesso |
|---|---|---|
| `POST` | `/auth/register` | público |
| `POST` | `/auth/verify-email` | público |
| `POST` | `/auth/resend-verification` | público |
| `POST` | `/auth/login` | público |
| `POST` | `/auth/refresh` | público (usa o refresh token) |
| `POST` | `/auth/logout` | público (usa o refresh token) |
| `POST` | `/auth/forgot-password` | público |
| `POST` | `/auth/reset-password` | público |
| `GET` | `/auth/me` | autenticado |
| `GET` | `/products`, `/products/:id` | autenticado |
| `POST` `PATCH` `DELETE` | `/products`, `/products/:id` | **ADMIN** |
| `GET` | `/categories`, `/categories/:id` | autenticado |
| `POST` `PATCH` `DELETE` | `/categories`, `/categories/:id` | **ADMIN** |
| `GET` | `/orders`, `/orders/:id` | autenticado (só os próprios; ADMIN vê todos) |
| `POST` | `/orders` | autenticado |
| `PATCH` | `/orders/:id/status` | dono ou ADMIN, conforme a transição |

### Paginação

As listagens aceitam `?page=1&limit=20` (limite máximo de 100) e devolvem um envelope:

```json
{ "data": [], "total": 137, "page": 1, "limit": 20 }
```

`GET /products` aceita também `?categoryId=` e `?name=` (busca parcial, sem diferenciar maiúsculas).

### Idempotência na criação de pedido

`POST /orders` aceita o cabeçalho `Idempotency-Key`. Repetir a mesma chave com o mesmo carrinho
devolve o pedido já criado, em vez de duplicar; a mesma chave com um carrinho diferente responde
`409`. Sem o cabeçalho, cada chamada cria um pedido novo.

## Decisões de segurança que explicam o comportamento da API

- **Pedido de outro usuário devolve `404`, não `403`.** Um `403` confirmaria que o pedido existe e,
  com ids sequenciais, permitiria descobrir o volume de pedidos de terceiros.
- **Cadastro e recuperação de senha respondem sempre a mesma mensagem genérica**, independentemente
  de o email existir, para não permitir enumeração de contas.
- **`role` não é aceito no corpo de nenhuma requisição.** O `ValidationPipe` global usa
  `forbidNonWhitelisted`, então enviar o campo resulta em `400`.
- **Migrations versionadas com `synchronize` desligado.** O schema nunca muda sozinho a partir das
  entidades.

## Testes

```bash
npx jest                                    # 138 testes unitários
npx tsc -p tsconfig.build.json --noEmit     # checagem de tipos
```

Os testes end-to-end dependem de `TEST_DATABASE_URL` apontando para um banco isolado; sem essa
variável a suíte e2e é ignorada. Consequência conhecida: os testes de lock usam mocks, então **não há
cobertura automatizada de concorrência contra um Postgres real** — os cenários de corrida foram
verificados manualmente.

## Estrutura

```
src/
├─ common/dto/          paginação compartilhada
├─ config/              validação de ambiente, configuração HTTP e OpenAPI
├─ db/                  data source e migrations
├─ decorators/          @Public, @Roles, @CurrentUser
└─ modules/
   ├─ auth/             autenticação, sessões, tokens, guards
   ├─ usuarios/         entidade de usuário e projeção pública
   ├─ produtos/         catálogo de produtos
   ├─ categorias/       catálogo de categorias
   ├─ pedidos/          pedidos, itens e ciclo de vida
   └─ email/            envio transacional via Resend
```

Os nomes de pasta em português convivem com `auth/` e `email/` em inglês por decisão do projeto;
nomes de arquivo e identificadores de código permanecem em inglês.

## Licença

Projeto de estudo, sem licença de uso definida.
