# Auditorias de segurança

Relatórios de auditoria adversarial da API. Cada auditoria roda vários revisores em paralelo,
com **testes reais** (curl contra a aplicação no ar, queries diretas no Postgres) — não análise
teórica de código.

Cada pasta contém:

- `CONSOLIDATED.md` — visão consolidada, achados ranqueados por severidade, com o que foi corrigido
- `finding-*.md` — relatório bruto de cada revisor, com comando executado e resposta obtida

## Auditorias realizadas

### `2026-08-26-persistencia/`

Auditoria após o subprojeto 2 (persistência TypeORM + Supabase).

Achado crítico: **RLS desabilitado** nas 5 tabelas, com `anon`/`authenticated` tendo CRUD total —
qualquer detentor da anon key acessava o banco inteiro via Data API do Supabase, ignorando a API NestJS.
Corrigido pela migration `1787743956010-EnableRls.ts`.

Também confirmou por teste real uma **condição de corrida** no estoque (10 pedidos concorrentes num
produto com estoque 10 passaram todos). Corrigido com `SELECT FOR UPDATE`.

### `2026-08-26-autenticacao/`

Auditoria após o subprojeto 3 (autenticação JWT).

Achado principal: **oráculo de senha** no login — conta não verificada com senha correta retornava 403
específico, enquanto senha errada retornava 401 genérico, permitindo descobrir senhas sem verificar
email. Confirmado independentemente por dois revisores (leitura de código e exploit ao vivo).
Corrigido: resposta genérica idêntica nos dois casos, com reenvio automático da verificação.

O restante da implementação de autenticação passou nos testes adversariais: JWT adulterado, `alg:none`,
revogação imediata no logout, reuso de refresh token, 5 refreshes concorrentes, e enumeração de conta.

## Achados ainda abertos

Ver a seção correspondente em cada `CONSOLIDATED.md`. Os principais em aberto:

- Rotas de negócio (`/products`, `/categories`, `/orders`) sem autorização — endereçado pelo subprojeto 4
- Inteiros sem limite superior causam 500 em vez de 400
- `OriginGuard` só valida em produção
- Aplicação conecta ao Postgres como superusuário (`postgres`), que ignora RLS
