# Autorização e ownership — design

**Data:** 2026-08-27
**Subprojeto:** 4 de 5 (Validação → Persistência → Autenticação → **Autorização** → Frontend)
**Branch:** `feat/autorizacao-ownership`

## Contexto

A autenticação existe (subprojeto 3), mas nenhuma rota de negócio é protegida. Hoje, qualquer pessoa
com acesso à porta 3000 lê, cria, altera e apaga produtos, categorias e pedidos, sem token nenhum.
Foi o achado HIGH da auditoria `docs/auditorias/2026-08-26-persistencia/`, confirmado ao vivo por curl.

Pedidos também não têm dono: `Order` não referencia `User`. Qualquer um cria pedido anônimo, e não há
como um cliente ver "meus pedidos".

## Objetivo

- Nenhuma rota acessível sem autenticação, exceto as de autenticação em si
- Distinguir dois papéis: administrador (gerencia catálogo) e cliente (compra)
- Pedido pertence a um usuário; cliente só enxerga os próprios
- Fechar o IDOR latente: hoje IDs sequenciais permitem enumerar tudo

## Fora de escopo

- Paginação, filtro e busca no catálogo — necessários para o frontend, mas são um subprojeto próprio
- Status de pedido e cancelamento
- Alteração de email, exclusão de conta, MFA
- Endpoint de administração de usuários

## Decisões

### Dois papéis: ADMIN e CLIENTE

Modelo real de marketplace: quem vende gerencia o catálogo, quem compra não. Alternativa considerada
e descartada: "todo autenticado pode tudo" — deixaria qualquer cliente cadastrado apagar produto.

### Papel nunca vem de request

`role` é coluna do banco com default `CLIENTE`. `RegisterDto` não possui o campo, e o `ValidationPipe`
global (`forbidNonWhitelisted: true`) rejeita campo não declarado com 400. Enviar `{"role":"ADMIN"}`
no cadastro falha, não escala privilégio.

Promoção a administrador acontece apenas por acesso direto ao banco, via script de seed. Sem endpoint
de promoção nesta etapa — endpoint sensível a mais é superfície de ataque a mais, e ainda exigiria um
primeiro admin via seed de qualquer forma.

### Guard global, exceções explícitas

`JwtAuthGuard` registrado como `APP_GUARD`: protege tudo por padrão. Rotas públicas marcadas com
`@Public()`.

A alternativa (`@UseGuards()` por controller) falha aberta: esquecer a anotação num controller novo o
deixa público sem ninguém perceber. Foi exatamente o que aconteceu neste projeto — três módulos
ficaram abertos durante dois subprojetos inteiros. Guard global falha fechada: esquecer deixa a rota
protegida, o que quebra visivelmente em vez de vazar silenciosamente.

`RolesGuard` roda depois, lendo `@Roles(Role.ADMIN)`.

### Pedido de outro usuário retorna 404, não 403

Um 403 confirmaria que o pedido existe. Repetindo a chamada com IDs sequenciais, um atacante mapearia
quantos pedidos o sistema tem e quando foram criados. Com 404, "existe mas não é seu" fica
indistinguível de "não existe".

### Verificação de dono no service, não no controller

O controller é fácil de esquecer ao adicionar uma rota. O service é caminho obrigatório: qualquer
chamador passa por ele. A auditoria anterior já elogiou esse padrão na validação de `categoryId`.

### Dados de teste apagados na migration

`Order.userId` é `NOT NULL`. Os 28 pedidos e 28 itens existentes não têm dono e impediriam a coluna de
subir. Todos foram gerados pelas auditorias deste projeto — nenhum é dado real.

A alternativa (`userId` nullable) carregaria para sempre a checagem "e se não tiver dono?" em todo
código de ownership, enfraquecendo a garantia.

**Esta etapa é irreversível e exige confirmação explícita do proprietário antes de executar.**

## Modelo de dados

### `users` — nova coluna

| Coluna | Tipo | Regra |
|---|---|---|
| `role` | enum (`ADMIN`, `CLIENTE`) | `NOT NULL`, default `CLIENTE` |

Enum criado como tipo Postgres nativo. Nunca preenchido a partir de dados de request.

### `orders` — nova coluna

| Coluna | Tipo | Regra |
|---|---|---|
| `userId` | uuid | `NOT NULL`, FK → `users.id`, com índice |

Índice em `userId` é obrigatório, não otimização: toda listagem de pedido de cliente filtra por ele.

`ON DELETE`: `NO ACTION`, consistente com as demais FKs do projeto. Apagar usuário com pedido falha —
comportamento correto, histórico de pedido não deve sumir com a conta.

## Matriz de autorização

| Rota | Acesso |
|---|---|
| `POST /auth/*` (register, login, refresh, logout, verify-email, resend-verification, forgot-password, reset-password) | Público |
| `GET /auth/me` | Autenticado |
| `GET /categories`, `GET /categories/:id` | Autenticado (qualquer papel) |
| `POST`, `DELETE /categories` | **ADMIN** |
| `GET /products`, `GET /products/:id` | Autenticado (qualquer papel) |
| `POST`, `PATCH`, `DELETE /products` | **ADMIN** |
| `POST /orders` | Autenticado — grava o usuário como dono |
| `GET /orders` | CLIENTE: apenas os próprios. ADMIN: todos |
| `GET /orders/:id` | Dono ou ADMIN. Demais: 404 |
| `GET /` (health) | Público |

## Componentes

| Arquivo | Responsabilidade |
|---|---|
| `src/modules/users/entities/user.entity.ts` | Coluna `role` e enum `Role` |
| `src/decorators/public.decorator.ts` | Marca rota como dispensada de autenticação |
| `src/decorators/roles.decorator.ts` | Declara papéis exigidos |
| `src/decorators/current-user.decorator.ts` | Extrai o usuário autenticado do request |
| `src/modules/auth/guards/jwt-auth.guard.ts` | Passa a respeitar `@Public()` |
| `src/modules/auth/guards/roles.guard.ts` | Aplica `@Roles()` |
| `src/db/migrations/*-AddRoleAndOrderOwner.ts` | Enum, colunas, índice, limpeza dos dados de teste |
| `scripts/seed-admin.ts` | Promove um email existente a ADMIN |

Serviços de `orders` passam a receber o usuário autenticado como parâmetro; controllers extraem com
`@CurrentUser()`.

## Fluxo de erro

| Situação | Resposta |
|---|---|
| Sem token, ou token inválido/expirado/revogado | 401 |
| Autenticado, papel insuficiente | 403 |
| Pedido de outro usuário | **404** (não 403 — ver decisões) |
| Recurso realmente inexistente | 404 |

## Testes

Seguindo o padrão estabelecido no subprojeto 3, que abandonou deliberadamente a convenção anterior de
"sem testes automatizados" para código de segurança. Cenários mínimos:

- Rota de negócio sem token retorna 401
- Cliente autenticado recebe 403 ao criar produto ou categoria
- Admin cria, altera e remove catálogo com sucesso
- `role` enviado no corpo do cadastro é rejeitado com 400 e não altera o papel gravado
- Pedido criado registra o usuário autenticado como dono
- Cliente não vê pedido de outro na listagem
- Cliente recebe **404** ao acessar pedido de outro por ID
- Admin vê todos os pedidos
- Rota nova sem `@Public()` nasce protegida (verifica que o guard é global)

## Riscos

| Risco | Mitigação |
|---|---|
| Perda de dados na limpeza da migration | Confirmação explícita do proprietário; dados são exclusivamente de teste |
| Rota pública esquecida sem `@Public()` quebra autenticação | Teste manual de todos os fluxos de auth após aplicar o guard global |
| `role` gravado a partir de request | `RegisterDto` sem o campo, `forbidNonWhitelisted` ativo, teste dedicado |
| Enum Postgres dificulta adicionar papel futuro | Aceito: adicionar valor a enum é `ALTER TYPE ... ADD VALUE`, suportado |
