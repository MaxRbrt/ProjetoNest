# CLAUDE.md — projeto-test

API de catálogo e pedidos em NestJS + TypeORM + Postgres (Supabase). Projeto de estudo: o objetivo é
aprender os mecanismos por dentro (autenticação manual, autorização, persistência, concorrência), não
terceirizar para serviços que escondam o funcionamento.

> **Este arquivo é o único registro que sobrevive num clone.** O `.gitignore` exclui `docs/` e
> `/.superpowers`, então specs, planos, ADRs, auditorias e o ledger de execução **não vão para o
> GitHub** — existem apenas na máquina onde foram escritos. Toda decisão que precisa durar tem que
> estar aqui. Atualize este arquivo ao fim de cada bloco de trabalho, antes de considerá-lo pronto.

## Estado atual

Backend com o núcleo completo. Última atualização: 2026-08-28.

| Área | Estado |
|---|---|
| Autenticação | Completa — cadastro, verificação de email, login, refresh rotativo, logout, recuperação de senha, Argon2, checagem HIBP, throttling, sessões revogáveis, `no-store`, `OriginGuard` |
| Autorização | Completa — guard global (toda rota nasce protegida), `@Public()`, `@Roles()`, ownership de pedido, promoção a admin fora da API |
| Catálogo | Produtos e categorias com CRUD completo, listagem paginada, filtro por categoria e busca por nome |
| Pedidos | Criação transacional com baixa de estoque e lock pessimista, idempotência por `Idempotency-Key`, ciclo de vida (`PENDENTE`/`PAGO`/`CANCELADO`) com estorno de estoque no cancelamento |
| Persistência | 11 migrations versionadas, `synchronize` desligado, RLS ativo |
| Documentação da API | OpenAPI em `/docs`, desligado quando `NODE_ENV=production` |
| Testes | 24 suítes / 138 testes unitários. **Sem E2E** — ver dívidas |

## Decisões que não são óbvias no código

- **JWT manual em vez de Supabase Auth** — o objetivo é aprender o mecanismo de sessão por dentro.
- **Pedido alheio devolve 404, não 403.** Um 403 confirmaria que o pedido existe e, com ids
  sequenciais, permitiria enumerar o volume de pedidos de terceiros. Vale para `GET /orders/:id` e
  para `PATCH /orders/:id/status`.
- **Política de senha: mínimo 8 caracteres, com maiúscula, número e símbolo.** Decisão explícita do
  proprietário em 2026-08-31, substituindo o mínimo anterior de 15 sem exigência de composição. A
  regra vive num lugar só (`src/modules/auth/password-policy.ts`) e é aplicada **duas vezes**: nos
  DTOs, para responder 400 com a lista do que falta, e dentro de `PasswordService.hash`, porque o
  serviço também é chamado por fluxos que não passam por requisição HTTP. Contagem por pontos de
  código (`Array.from`), não por `length`: um emoji valeria por dois caracteres.

  Ressalva registrada, não resolvida: exigir composição com mínimo baixo tende a produzir senhas
  previsíveis — `Senha@12` cumpre todas as regras. O que segura a barra é a checagem HIBP, que na
  verificação real **rejeitou exatamente essa senha** por constar em vazamentos. Se a checagem HIBP
  for algum dia desativada, esta política fica frágil.

- **O papel do usuário nunca vem da requisição.** `RegisterDto` não declara `role` e o
  `ValidationPipe` global usa `forbidNonWhitelisted`. Promover alguém só via
  `npm run seed:admin -- <email> --confirm-target=<user>@<host>:<port>/<database>`, que exige
  confirmação exata do banco alvo antes de abrir conexão — host e database sozinhos não bastam,
  porque o pooler do Supabase compartilha host entre projetos distintos.
- **Estados de logística ficaram fora do enum de pedido.** Sem endereço nem frete no sistema,
  `ENVIADO`/`ENTREGUE` seriam campo decorativo. Transições válidas: `PENDENTE→PAGO` (só ADMIN),
  `PENDENTE→CANCELADO` (dono ou ADMIN), `PAGO→CANCELADO` (só ADMIN). `CANCELADO` é terminal.
- **`OrderItem` congela `productName` e `unitPrice` na compra.** Sem isso o pedido antigo exibiria o
  preço atual do produto, não o preço pago, e um produto removido deixaria o item sem identificação.
- **Toda listagem tem `ORDER BY` explícito.** Não é estética: sem ele o Postgres não garante ordem
  entre consultas e o mesmo registro pode aparecer em duas páginas ou sumir de todas.
- **`page` e `limit` têm teto** (10.000 e 100). Sem teto em `page`, `1e100` passa no `@IsInt` e vira
  um `OFFSET` impraticável que responde erro interno em vez de 400.
- **Locks são pedidos em ordem crescente de `productId`**, tanto na criação quanto no estorno do
  cancelamento. Ordens opostas travariam em deadlock quando as duas operações rodam em paralelo.

## Dívidas conhecidas (decisões conscientes, não esquecimento)

1. **Sem testes E2E.** Falta `TEST_DATABASE_URL` — um banco isolado. O único e2e existente
   (`test/app.e2e-spec.ts`) fica em `describe.skip` sem essa variável. Consequência: os testes de
   lock usam mocks, então **não há prova de concorrência contra Postgres real**. É a dívida mais
   relevante da lista.
2. **Dinheiro em ponto flutuante.** `Product.price`, `Order.total` e `OrderItem.unitPrice` usam
   `float`. O correto é `numeric(12,2)`, mas o TypeORM devolve `numeric` como **string**, o que
   quebraria todo cálculo de total, comparação de estoque e testes. Merece subprojeto próprio.
3. **TOCTOU nas checagens de dependência.** Em `products.service` e `categories.service`, `count` e
   `remove` não são atômicos. A FK protege o dado, mas o erro `23503` viraria 500 em vez de 409.
4. **Sem carrinho, pagamento, endereço, frete, cupom ou avaliação** — fora de escopo por decisão.

## Convenções

- **Idioma:** comentários, mensagens de erro/log, documentação e nomes de teste em **PT-BR**;
  identificadores de código (variáveis, funções, classes) em **inglês**.
- **Comentário de bloco:** título e explicação ficam os dois **dentro** da caixa, e a explicação
  nunca fica solta depois do fechamento:

  ```ts
  // ---------------------------------------------
  // Listagem de pedidos
  // Administrador enxerga todos; cliente enxerga apenas os próprios.
  // ---------------------------------------------
  findAll(user: PublicUser) { ... }
  ```

  Bloco só com título também vale, quando a seção se explica. **Nada de comentário solto no meio do
  corpo da função** — a explicação inteira vai uma vez só no bloco do topo, e o corpo roda limpo.
- **Nomes de pasta são mistos de propósito:** `src/modules/auth/` e `src/modules/email/` em inglês;
  `usuarios/`, `produtos/`, `categorias/`, `pedidos/` em português. Nomes de **arquivo** continuam em
  inglês (`orders.service.ts` dentro de `pedidos/`). Não normalizar sem pedido explícito.
- **TDD:** teste que falha primeiro, depois implementação.
- **Commits em lotes de ~3 arquivos**, com o comando entregue ao usuário — nunca um lote gigante.
- **Revisão adversarial (Codex)** uma vez no fechamento de cada bloco de trabalho, não por tarefa
  individual. Rodar por tarefa é desperdício; rodar zero vezes deixa mudança de auth sem segunda
  opinião. Nas quatro vezes que rodou neste projeto, achou problema real — inclusive de severidade
  alta. **Não declarar trabalho pronto antes de a revisão responder.**

## Regras duras da sessão

- **Nenhum comando `git` ou `gh` pode ser executado pela sessão**, nem de leitura (`status`, `log`,
  `diff`). Reforçado por hook. Consequência prática: o estado vive no working tree e o assistente
  entrega os comandos de commit prontos para o usuário executar.
- **Migrations destrutivas exigem confirmação explícita do proprietário** antes de rodar.

## Quirks de ambiente (Windows — evitar redescobrir)

- `npx ts-node -e "import('./src/db/data-source')..."` falha com
  `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`. Alternativa: escrever um script `.ts` temporário na raiz,
  rodar com `npx ts-node arquivo.ts` e apagar em seguida.
- O wrapper `codex-ask.sh` da skill `cc-skill-codex:codex` falha aqui — `python3` no PATH é o stub da
  Windows Store, não um Python real. Usar o fallback inline da skill (`codex exec` direto via
  heredoc).
- Processo `node dist/main` obsoleto pode ficar preso na porta 3000 entre sessões. Conferir com
  `netstat -ano | grep :3000` antes de testar rota manualmente — já mascarou teste uma vez.
- `@nestjs/swagger` está fixado na major **11**: a 12 exige NestJS 12 e o projeto usa NestJS 11.
  Não resolver esse conflito com `--legacy-peer-deps`.
- O `/tmp` do bash e o `/tmp` do Node divergem no Windows. Usar caminho absoluto ao passar arquivo
  entre um e outro.

## Comandos

| Comando | Para quê |
|---|---|
| `npm run start` / `start:dev` | Sobe a API (porta 3000) |
| `npx jest` | Testes unitários |
| `npx tsc -p tsconfig.build.json --noEmit` | Checagem de tipos (o `tsc` sem esse config acusa erros pré-existentes nos specs) |
| `npm run format` | Prettier |
| `npm run migration:run` / `migration:revert` | Migrations |
| `npm run seed:admin -- <email> --confirm-target=...` | Promove usuário a ADMIN |

## Documentação local (não versionada)

Existe apenas na máquina de origem — se este repositório for clonado, nada disto vem junto:

- `docs/decisions/` — ADRs.
- `docs/superpowers/specs/` e `docs/superpowers/plans/` — desenho e plano de cada bloco de trabalho.
- `.superpowers/sdd/<slug>/progress.md` — ledger de execução, com os rulings tomados no caminho.
- `docs/auditorias/` — achados de auditoria de segurança.

Ao retomar em uma máquina que tenha esses arquivos, o `progress.md` mais recente é o de maior
densidade de contexto — comece por ele, e leia **até o fim**: uma sessão interrompida pode deixá-lo
cortado no meio de uma tarefa cujo código já foi escrito. Antes de reimplementar qualquer coisa,
verifique se ela já existe em `src/`.
