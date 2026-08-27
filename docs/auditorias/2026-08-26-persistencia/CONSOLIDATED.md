# Auditoria de segurança consolidada — 2026-08-26

4 revisores em paralelo, testes reais (curl contra API viva + queries diretas no Postgres real), sem teoria. Rankeado por severidade real, com verificação cruzada.

## 1. CRITICAL — RLS desabilitado + grants totais para anon/authenticated (Data API do Supabase totalmente aberta)

**Confirmado direto no Postgres:** as 5 tabelas (`categories`, `products`, `orders`, `order_items`, `migrations`) têm RLS desligado E os roles `anon`/`authenticated` (os que o Data API/PostgREST do Supabase usa) têm grant total de SELECT/INSERT/UPDATE/DELETE/TRUNCATE — configuração padrão do Supabase, não algo que a aplicação fez.

**Impacto real:** quem tiver a anon key do projeto (pública por design, vai aparecer em qualquer frontend futuro) pode ler/escrever/apagar/truncar todas as 5 tabelas direto via `https://<ref>.supabase.co/rest/v1/...`, **sem passar pelo NestJS, sem validação, sem regra de negócio nenhuma**. Isso já está armado — não é "se um dia tiver frontend".

**Verificação cruzada minha:** a `DATABASE_URL` da aplicação conecta como role `postgres` (confirmado quando corrigimos o `.env` antes) — totalmente diferente de `anon`/`authenticated`. Então a correção abaixo não quebra a conexão da aplicação.

**Fix proposto** (não aplicado ainda):
```sql
ALTER TABLE public.categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migrations  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.categories, public.products, public.orders, public.order_items, public.migrations
  FROM anon, authenticated;
```
(RLS ligado sem política = nega tudo por padrão pro Data API; a app continua funcionando pois usa outro role. Quando entrar frontend/Supabase Auth de verdade, criar políticas específicas nessa hora.)

**APLICADO.** Migration `src/db/migrations/1787743956010-EnableRls.ts` rodada contra o Supabase real. Confirmado: app segue respondendo normalmente (`GET /products` → 200) — conexão via role `postgres` não afetada pelo `REVOKE` de `anon`/`authenticated`.

## 2. HIGH — Nenhuma autenticação/autorização em nenhum endpoint

Já sabido (JWT é o próximo sub-projeto), mas agora com escopo real confirmado: qualquer um lê/cria/edita/apaga tudo em `/categories`, `/products`, `/orders`, sem exceção. Sem ação nova aqui além do que já está planejado — só reforça a prioridade do sub-projeto 3.

## 3. HIGH (reclassificado — era "represado" como teórico, agora confirmado 10/10) — Condição de corrida em `POST /orders` causa overselling real

O Codex já tinha apontado isso na Task 4 e eu tinha decidido represar como "fora de escopo, sem urgência". **Isso mudou**: o revisor reproduziu de verdade — 10 pedidos concorrentes num produto com estoque 10 (deveriam passar só 5), e **os 10 passaram**, estoque final ficou em 4 (nem zero, nem negativo — dado silenciosamente incorreto). Taxa de reprodução: 100% na primeira tentativa real.

Isso não é mais "risco teórico de escala futura" — é um bug de integridade de dados real e fácil de disparar. Reviso minha decisão anterior: não dá mais pra deixar pra depois indefinidamente.

**Fix:** `SELECT ... FOR UPDATE` (lock pessimista) na leitura do produto dentro da transação, ou update atômico condicional (`UPDATE products SET stock = stock - :qty WHERE id = :id AND stock >= :qty`, checando linhas afetadas).

**APLICADO e verificado com teste real.** `orders.service.ts`: `manager.findOneBy` → `manager.findOne(..., { lock: { mode: 'pessimistic_write' } })`, mais itens ordenados por `productId` antes do loop (evita deadlock quando um pedido tem múltiplos produtos — duas transações concorrentes sempre pedem locks na mesma ordem). Reteste com o mesmo cenário que expôs o bug (10 pedidos concorrentes, estoque 10, qty 2 cada): **5 sucessos, 5 falhas (400), estoque final = 0** — resultado correto, contra os 10/10 sucessos e estoque=4 de antes.

## 4. MEDIUM — Inteiros sem limite superior causam 500 cru em vez de 400 limpo

`stock`, `categoryId` e IDs de path (`:id`) aceitam qualquer inteiro, sem `@Max()`. Valor acima do limite do Postgres (`int4`, 2147483647) estoura erro não tratado → 500 em vez de 400, sem autenticação, reproduzível em quase todo endpoint numérico. Não vaza dado, mas polui métricas/alertas (500 tratado como incidente quando é só input malformado).

**Fix:** `@Max(2147483647)` nos DTOs relevantes + validação de range no pipe de `:id` + filtro de exceção global mapeando `QueryFailedError` pra 400 como rede de segurança.

## 5. LOW (hoje) / vira IDOR real mais tarde — IDs sequenciais permitem enumerar tudo

Sem dono nenhum nos dados hoje, não é violação de fronteira ainda. Mas quando autenticação com ownership entrar, autenticação sozinha NÃO resolve isso — precisa checagem de propriedade explícita em cada `findOne`/`update`/`remove`.

## 6-7. LOW — Sem `helmet`, sem rate-limiting (`@nestjs/throttler`)

Padrão, barato de resolver, baixa prioridade real numa API JSON sem cookie/HTML hoje. Vale antes de qualquer exposição fora do ambiente local.

## Não-achados (verificados, não são problema)
- SQL injection: nenhuma brecha, ORM parametriza corretamente
- Mass assignment: `forbidNonWhitelisted` bloqueia de verdade
- CORS: desligado por padrão (seguro), nada a fazer agora
- `npm audit`: 0 vulnerabilidades
- Sem segredo hardcoded, `.env` protegido corretamente
- `synchronize: false` incondicional, sem drift dev/prod
- Migrations limpas, sem seed/credencial
