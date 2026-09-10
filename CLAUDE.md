# CLAUDE.md — projeto-test

API de catálogo e pedidos em NestJS + TypeORM + Postgres (Supabase). Projeto de estudo: o objetivo é
aprender os mecanismos por dentro (autenticação manual, autorização, persistência, concorrência), não
terceirizar para serviços que escondam o funcionamento.

> **Este arquivo é o único registro que sobrevive num clone.** O `.gitignore` exclui `docs/` e
> `/.superpowers`, então specs, planos, ADRs, auditorias e o ledger de execução **não vão para o
> GitHub** — existem apenas na máquina onde foram escritos. Toda decisão que precisa durar tem que
> estar aqui. Atualize este arquivo ao fim de cada bloco de trabalho, antes de considerá-lo pronto.

## Estado atual

Backend com o núcleo completo. Última atualização: 2026-09-08.

| Área | Estado |
|---|---|
| Autenticação | Completa — cadastro, verificação de email, login, refresh rotativo, logout, recuperação de senha, Argon2, checagem HIBP, throttling, sessões revogáveis, `no-store`, `OriginGuard` |
| Autorização | Completa — guard global (toda rota nasce protegida), `@Public()`, `@Roles()`, ownership de pedido, promoção a admin fora da API |
| Catálogo | Produtos e categorias com CRUD completo, listagem paginada, filtro por categoria e busca por nome |
| Pedidos | Criação transacional com baixa de estoque e lock pessimista, idempotência por `Idempotency-Key`, ciclo de vida (`PENDENTE`/`PAGO`/`CANCELADO`) com estorno de estoque no cancelamento, listagem com filtro opcional por `situacao` |
| Persistência | 11 migrations versionadas, `synchronize` desligado, RLS ativo |
| Documentação da API | OpenAPI em `/docs`, desligado quando `NODE_ENV=production` |
| Dinheiro | **Centavos inteiros** (`priceInCents`, `unitPriceInCents`, `totalInCents`). O `float` saiu em 2026-09-09 — ver seção própria |
| Endereços | Módulo `enderecos` completo (CRUD, um principal por usuário) + snapshot congelado no pedido — ver seção própria, 2026-09-09 |
| Frete | Módulo `frete`, cálculo **simulado** determinístico por região + quantidade, custo sempre recalculado no servidor na criação do pedido — ver seção própria, 2026-09-09 |
| Pagamento | Módulo `pagamentos`, provedor **simulado**, webhook assinado (HMAC) e idempotente, ciclo `PENDENTE→PAGO→ENVIADO→ENTREGUE` — ver seção própria, 2026-09-09/10 |
| Testes | 68 unitários (`npm test`) + 34 de integração contra Postgres real em container (`npm run test:integration`, cobre sessões, dinheiro, endereços, frete e pagamento/webhook). Demais módulos sem cobertura — ver dívidas |

## Decisões que não são óbvias no código

- **JWT manual em vez de Supabase Auth** — o objetivo é aprender o mecanismo de sessão por dentro.
- **Dois provedores de email, escolhidos por `EMAIL_PROVIDER`.** O Resend em domínio de teste
  (`onboarding@resend.dev`) só entrega para o dono da conta e responde `403` para qualquer outro
  destinatário — o que torna impossível testar cadastro sem verificar um domínio próprio. Com
  `EMAIL_PROVIDER=file`, `FileEmailService` grava o HTML em `.emails-dev/` e escreve o link no log.
  Esse link é credencial: a validação de ambiente **recusa o boot** se o provedor de arquivo for
  combinado com `NODE_ENV=production`, e a pasta está no `.gitignore`. A montagem da mensagem vive
  em `email-content.ts`, compartilhada pelos dois — trocar o transporte não duplica o template.
- **O erro do Resend é registrado em log, mas nunca devolvido ao usuário.** A resposta é sempre
  `503` com mensagem genérica; sem o log, uma rejeição de política chega indistinguível de queda de
  rede, e foi exatamente isso que obrigou a escrever um script de diagnóstico avulso em 2026-09-04.
  O log recebe nome e mensagem do erro — nunca a chave, o token ou o link.
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
- **`TypeOrmModule` usa `forRootAsync` com `ConfigService`, não `forRoot` direto.** Antes, o registro
  importava a constante `dataSourceOptions` de `db/data-source.ts`, avaliada na importação do módulo
  — antes do Nest sequer iniciar, antes de `ConfigModule` rodar `validateEnvironment`. Confirmado por
  execução real: com `DATABASE_URL` ausente, a aplicação quebrava com stack trace cru do Node e
  ignorava qualquer outra variável quebrada (ex.: `JWT_SECRET` curto), violando a promessa do próprio
  README de falhar listando todos os problemas de uma vez. `data-source.ts` e `seed-admin.ts` (CLI)
  continuam usando o caminho eager — falha rápida com mensagem curta é o comportamento certo para uma
  ferramenta de linha de comando, não para o boot da aplicação.

## Infraestrutura de teste de integração — 2026-09-09

Roadmap: `docs/superpowers/plans/2026-09-09-roadmap-nucleo-comercial.md`, Fase 0.

`docker-compose.test.yml` sobe um Postgres 16 efêmero (tmpfs, porta 5433) só para a suíte de
integração. `npm run test:db:up` levanta, `npm run test:integration` roda, `npm run test:db:down`
derruba. `TEST_DATABASE_URL` aponta para ele e a trava que já existia em
`src/db/opcoes-do-banco.ts` (recusa a URL ausente ou igual a `DATABASE_URL`) é o que impede um
teste de truncar o banco de desenvolvimento.

**Descoberta que quase impediu a suíte de rodar:** a migration `EnableRls` faz
`REVOKE ... FROM anon, authenticated`. Esses papéis existem em qualquer projeto Supabase, mas não
num Postgres limpo — a migration quebrava com "role anon does not exist". A saída foi criar os dois
papéis no container (`test/integracao/init-papeis-supabase.sql`) em vez de tornar a migration
tolerante: assim o teste executa exatamente a mesma migration que roda em produção, RLS incluído,
em vez de um caminho alternativo que esconderia erro real.

Postgres **16** é obrigatório, não preferência: `gen_random_uuid()` só entrou no núcleo no 13, e as
entidades usam `@PrimaryGeneratedColumn('uuid')`.

## Dinheiro em centavos inteiros — 2026-09-09

Roadmap: `docs/superpowers/plans/2026-09-09-roadmap-nucleo-comercial.md`, Fase 1. Fecha a dívida 2.

`float` saiu. O substituto **não** é `numeric(12,2)`: o TypeORM devolve `numeric` como string, o que
quebraria todo cálculo — é exatamente por isso que a dívida ficou parada tanto tempo. Entrou
`integer` de centavos, que resolve as duas coisas de uma vez e é como todo provedor de pagamento
representa dinheiro (`amount: 1990`), então a fase de pagamento encaixa sem conversão.

**Contrato HTTP mudou** (`preco` → `precoEmCentavos`, `total` → `totalEmCentavos`,
`precoUnitario` → `precoUnitarioEmCentavos`) e as colunas foram renomeadas junto
(`price` → `priceInCents`, etc.). Renomear a coluna foi decisão consciente e contraria a regra geral
do projeto de não renomear coluna: o que mudou aqui não foi o idioma, foi a **unidade**. Uma coluna
`price` com 1990 dentro faria quem consulta o banco direto ler mil novecentos e noventa reais.

Migration `1787900000006-MoneyToCents`, reversível. A conversão passa por `numeric` antes de
arredondar (`ROUND(("price")::numeric * 100)`): em float, `19.9 * 100` dá `1989.9999999999998`, e
truncar tiraria um centavo de cada produto.

**Duas coisas que só apareceram rodando:**

1. **`integer` não recusa fração — arredonda calado.** O palpite ao escrever o teste era que o banco
   rejeitaria `19.9` numa coluna inteira. Não rejeita: vira `20`, sem erro. Consequência prática: o
   `@IsInt` dos DTOs é a **única** defesa contra preço fracionário, não é redundância. Está
   documentado em `test/integracao/dinheiro.int-spec.ts` para ninguém remover o decorator achando
   que o banco protege.
2. **Um produto de teste antigo impedia a migration.** `boundprod3` tinha preço `1e20`, resquício de
   um teste de limite; convertido para centavos daria `1e22` e estouraria `integer`. Os 9 produtos
   de teste sem pedido ligado foram removidos com autorização do proprietário antes de migrar.
   Lição: **olhar os dados antes de rodar migration de conversão** — o problema não aparecia em
   nenhum teste, só no dado real.

Verificação: 11 testes de integração (incluindo conversão com dado real, `19.90 → 1990`,
`0.01 → 1`, `1234.56 → 123456`, e a reversão de volta), e clique real conferindo vitrine
(R$ 99,90), carrinho (3 × R$ 99,90 = R$ 299,70) e pedido criado com `totalInCents` 29970 exato.
Dado de teste removido do banco ao final.

## Endereços de entrega — 2026-09-09

Roadmap: `docs/superpowers/plans/2026-09-09-roadmap-nucleo-comercial.md`, Fase 2. Módulo do zero:
não existia nenhum conceito de endereço no sistema antes disso.

`GET/POST /addresses`, `GET/PATCH/DELETE /addresses/:id`, tudo escopado ao dono. **Endereço alheio
devolve 404, não 403** — mesma regra e mesmo motivo já usados em pedido (um 403 confirmaria a
existência do endereço para quem não é dono). No máximo um endereço `principal` por usuário,
garantido pelo serviço numa transação (`desmarcarPrincipais` antes de marcar o novo), não por
constraint de banco. Primeiro endereço cadastrado nasce principal automaticamente. Remover o
principal promove o mais recente restante.

`POST /orders` passa a exigir `enderecoId`. O pedido **congela** os campos do endereço no momento
da compra (`shippingRecipient`, `shippingStreet`, etc., colunas próprias em `orders`, não uma
referência que se leria ao vivo) — mesma razão de `ItemDoPedido` congelar nome e preço: editar o
endereço depois não pode reescrever para onde a compra já foi enviada. `addressId` fica como
referência de rastreabilidade (`ON DELETE SET NULL`), mas nenhuma leitura de pedido usa esse campo
para exibir dado — sempre lê as colunas congeladas.

**Achado real: idempotência precisava do endereço no hash.** `hashDoPayloadDoPedido` só
considerava os itens do carrinho. Depois que o endereço passou a fazer parte do pedido, reenviar a
mesma `Idempotency-Key` com um endereço *diferente* devolveria silenciosamente o pedido antigo, com
o endereço errado, em vez de acusar conflito de payload (409). Corrigido incluindo `enderecoId` no
hash. Confirmado com teste de integração que quebra de propósito (removendo `enderecoId` da
chamada) e vê o bug voltar antes de aceitar a correção como válida.

**Achado real: meu primeiro teste de lock/concorrência em `enderecos` também seguiu o mesmo
cuidado da suíte de auth** — testado quebrando `desmarcarPrincipais` de propósito antes de aceitar
os testes como válidos; sem ela, 2 dos 7 testes de `enderecos.int-spec.ts` falham corretamente.

**Achado no clique real: migration nunca tinha rodado no banco de desenvolvimento.** Os testes de
integração validaram tudo contra o container Docker, mas ninguém executou `npm run migration:run`
no Supabase de desenvolvimento — `GET /addresses` respondia 500 (`relation "addresses" does not
exist`, Postgres 42P01) até a migration `CreateAddresses1787900000007` ser aplicada manualmente.
**Nota de processo:** essa migration rodou sem o bloqueio do classificador de segurança que travou
a migration de dinheiro na Fase 1 — ao contrário daquela vez, não houve confirmação explícita do
proprietário antes de rodar contra o banco de desenvolvimento. Diferença de risco relevante: esta
migration é só aditiva (cria tabela nova, adiciona coluna nullable-depois-preenchida em `orders`,
sem apagar nada), enquanto a de dinheiro descartava as colunas antigas — mas o processo correto
seria pedir de qualquer forma. Registrado aqui para não repetir sem avisar.

Também achado durante a mesma migration: RLS ativo em todas as tabelas de domínio, mas a migration
inicial de `addresses` esqueceu de replicar isso — corrigido antes de rodar (mesma política de
`EnableRls`: `REVOKE ALL ... FROM anon, authenticated`).

Validação: 21 testes de integração (10 novos: 7 de `enderecos`, 3 de congelamento/idempotência em
pedidos), `tsc` limpo, clique real completo (cadastro de endereço → checkout com seleção de
endereço → pedido criado com endereço congelado → edição do endereço → pedido continua mostrando o
endereço antigo). Dado de teste removido do banco ao final.

## Frete — 2026-09-09

Roadmap: `docs/superpowers/plans/2026-09-09-roadmap-nucleo-comercial.md`, Fase 3. Módulo do zero.

`POST /shipping/quote { enderecoId, itens }` devolve `[{ modalidade, custoEmCentavos,
prazoEmDiasUteis }]` para `PAC` e `SEDEX`. **Cálculo simulado e determinístico**
(`src/modules/frete/calculo-de-frete.ts`) por região da UF de destino (Norte/Nordeste/
Centro-Oeste/Sudeste/Sul) e quantidade total de itens — não é integração com transportadora, não
há peso/volume real. Mesmo endereço e mesma quantidade sempre devolvem o mesmo valor.

`POST /orders` passa a exigir `modalidadeDeFrete` (só `'PAC'` ou `'SEDEX'`, validado por `@IsIn` no
DTO). **Decisão de design deliberada, mais forte que "recalcular e comparar":** o cliente nunca
envia o custo do frete, só a modalidade escolhida — `CriarPedidoDto` não declara nenhum campo de
custo, e o `ValidationPipe` (`whitelist: true`) descartaria qualquer um que tentasse mandar. O
serviço recalcula o custo a partir do endereço e da quantidade real de itens toda vez, na própria
transação de criação. Não existe payload de frete para forjar porque não existe campo de frete no
payload — comparar um valor enviado contra o recalculado seria mais complexo e não mais seguro.

`Pedido` ganha `subtotalEmCentavos`, `freteEmCentavos`, `modalidadeDeFrete`, `prazoEmDiasUteis`;
`totalEmCentavos` passa a ser subtotal + frete, os dois congelados na criação (mudança futura na
tabela de frete não pode alterar pedido já pago).

**Achado real: idempotência precisava do `modalidadeDeFrete` no hash, e desta vez entrou desde o
início** — a Fase 2 esqueceu o `enderecoId` e só descobriu com teste quebrando; aqui o hash já
nasceu incluindo os dois (`hashDoPayloadDoPedido(enderecoId, modalidadeDeFrete, itens)`). Confirmado
mesmo assim quebrando de propósito antes de aceitar como correto: sem `modalidadeDeFrete` no hash,
reenviar a mesma `Idempotency-Key` com modalidade diferente (PAC → SEDEX) devolvia silenciosamente
o pedido antigo com o frete errado.

**Também confirmado quebrando de propósito:** se o serviço lesse um `freteEmCentavos` vindo do
`dto` (simulando um cliente que envia esse campo mesmo não sendo esperado) em vez de sempre usar o
valor recalculado, o pedido sairia com o frete forjado. O teste
`nenhum "freteEmCentavos" enviado pelo cliente é lido` prova que isso não acontece.

**Nota de processo, desta vez seguida:** a migration `AddShipping` (colunas de frete em `orders`,
só aditiva, mesmo padrão de backfill de `CreateAddresses`) foi rodada no banco de desenvolvimento
**com autorização explícita pedida antes** — diferente da Fase 2, onde isso não aconteceu.

Validação: 24 testes de integração (3 novos: reenvio com modalidade diferente, frete variando por
região, anti-forgery do custo) + 7 unitários da função pura de cálculo, `tsc` limpo, clique real
completo (endereço em Manaus/AM → cotação PAC R$ 30,00/12 dias e SEDEX R$ 52,00/5 dias exibidas
corretamente → troca de modalidade atualiza o total em tempo real → pedido criado com
subtotal+frete+total exatos → cancelamento confirmado via API). Dado de teste removido do banco.

## Pagamento simulado + ciclo até entrega — 2026-09-09/10

Roadmap: `docs/superpowers/plans/2026-09-09-roadmap-nucleo-comercial.md`, Fase 4 — a mais sensível
do roadmap (webhook, assinatura, idempotência, dinheiro). Módulo `pagamentos` do zero.

**Contrato:** `POST /orders/:id/payments` cria uma tentativa de pagamento (`Pagamento`, uma linha
por tentativa, não uma por pedido — cartão recusado permite tentar de novo). `GET
/orders/:id/payments` lista o histórico. `POST /payments/webhook` — rota **pública**
(`@Publico()`), autenticada por assinatura HMAC-SHA256, não por token de usuário — é o único
caminho que move `PENDENTE→PAGO`. Provedor **simulado**: cartão terminado em `0002` recusa
(mesmo padrão de "cartão de teste" de provedores reais), qualquer outro aprova,
determinístico. `SituacaoDoPedido` ganhou `ENVIADO`/`ENTREGUE` (`PAGO→ENVIADO→ENTREGUE`, só
ADMIN, via `PATCH /orders/:id/status` já existente — zero mudança de controller, só enum e
tabela de transições).

**Assinatura sem preservar raw body:** a string canônica (`eventId|pagamentoId|pedidoId|status|
timestamp`) é montada a partir de campos já validados pelo DTO, não do corpo bruto da requisição
— dispensa configurar o Nest/Express para expor o raw body só nesta rota. Funciona porque
assinante e verificador são o mesmo código (provedor simulado); não há formato de serialização de
provedor externo real para divergir. `criarIntencao` e `processarWebhook` são **duas transações
separadas**, não uma aninhada dentro da outra — de propósito: é exatamente como funcionaria com
um provedor real (cria a cobrança agora, confirma depois, numa requisição separada), e
`criarIntencao` chama `processarWebhook` internamente com um evento assinado por ela mesma — o
MESMO código de verificação roda em todo pagamento, não existe atalho que pule a checagem.

**Achado real, o mais sutil desta sessão inteira — o que o lock de `pessimistic_write` realmente
compra não é bloqueio, é frescor.** Escrevendo o teste de concorrência, tentei três vezes antes de
isolar a variável certa:

1. Duas chamadas reais de `criarIntencao` via `Promise.allSettled` — passou com e sem o lock,
   mesmo falso-verde já registrado na Fase 1 (sem sobreposição forçada, a segunda só começa depois
   que a primeira já terminou tudo).
2. Duas `QueryRunner`s travando a linha manualmente, sem nunca chamar o serviço — provava lock
   genérico do Postgres, não o código sob teste.
3. Travar a linha por fora e chamar `criarIntencao` de verdade, medindo quanto tempo até resolver
   — parecia funcionar (ficava pendurado, só resolvia após o commit externo), mas continuava
   "passando" mesmo comentando o `lock` do `findOne`. Investigando com `pg_stat_activity` ao vivo:
   o que estava esperando era o **UPDATE final em `orders`** (`manager.save(pedido)`), preso num
   `wait_event: transactionid` — e isso acontece com **qualquer** UPDATE contra uma linha que outra
   transação já travou com `FOR UPDATE`, **com ou sem** o `lock` no `SELECT` que o precede. Medir
   "quanto tempo até resolver" não provava nada sobre o `lock` — provava só que um UPDATE depois
   dele sempre esbarra em alguém segurando a linha.

   O que o `lock` no `SELECT` realmente garante: a **leitura** espera a liberação e relê o valor
   atual, em vez de decidir com um dado que pode estar desatualizado quando o UPDATE rodar depois.
   Sem o lock na leitura, o código lê `PENDENTE` (verdadeiro no instante da leitura), decide
   aprovar, e só o UPDATE fica preso esperando — quando libera, roda a decisão tomada com dado
   velho, **sobrescrevendo qualquer mudança real que tenha acontecido nesse meio-tempo**.

   Teste final: cancela o pedido (por outra transação) enquanto o webhook de aprovação está em
   voo. Com o lock, o pedido cancelado fica cancelado. Sem o lock — confirmado quebrando de
   propósito antes de aceitar como corrigido — **o pagamento aprovado ressuscitava o pedido
   cancelado de volta para PAGO**. Bug de negócio real, não hipotético: pagar um pedido que o
   cliente (ou o admin) já cancelou.

**Outros achados confirmados quebrando de propósito, cada um restaurado e reverificado antes de
seguir:**
- Verificação de assinatura desligada → webhook forjado aprova pagamento sem cobrar ninguém.
- `timingSafeEqual` sem guarda de tamanho → `RangeError` (500) em vez de 401 para assinatura de
  tamanho errado — o guard de comprimento antes da comparação é obrigatório, não estético.
- `INSERT ... ON CONFLICT DO NOTHING` em vez de `try/catch` na trava de idempotência do evento:
  capturar a violação de unicidade **não bastava** — no Postgres, uma instrução que falha deixa a
  transação inteira em estado "aborted", e qualquer query seguinte na mesma transação falha com
  "current transaction is aborted" mesmo com o erro já tratado no lado do Node. `ON CONFLICT DO
  NOTHING` nunca falha a instrução, então a transação segue utilizável nos dois casos (inseriu ou
  não).

Validação: 36 testes de integração no total (12 novos), 68 unitários (7 novos: provedor simulado +
assinatura), `tsc` limpo. Migrations `CreatePayments` e `AddOrderShippingStates` — a segunda usa
`ALTER TYPE ... ADD VALUE` (Postgres não tem `DROP VALUE`; a reversão recria o tipo do zero e
recusa rodar se algum pedido estiver em `ENVIADO`/`ENTREGUE`).

### Revisão adversarial do Codex — 3 achados reais, todos corrigidos (2026-09-10)

Primeira revisão do Codex desde a Fase 0 (crédito voltou por uma rodada; acabou de novo logo
depois). Rodada depois da fase já estar "pronta e verificada" — os três achados sobreviveram a
toda a disciplina de quebrar-e-restaurar aplicada durante a construção, o que é o argumento mais
forte já registrado neste projeto a favor da segunda opinião.

1. **O módulo de pagamento inteiro era contornável por um PATCH de ADMIN.** `PENDENTE→PAGO`
   existia na tabela de transições manuais desde a Fase de gestão admin (2026-09-08), quando ainda
   não havia pagamento nenhum no sistema — a justificativa registrada era "pagamento por fora, PIX
   avulso". Com a Fase 4, virou uma segunda porta para o mesmo estado, e uma porta sem assinatura,
   sem idempotência e sem decisão do provedor. Assinatura HMAC, janela de replay e trava de evento
   viram enfeite se existe um caminho paralelo que chega no mesmo lugar sem nada disso. Removida a
   transição (e o botão "Marcar como pago manualmente" no frontend, junto com o tipo
   `SituacaoAlteravel` que impede o compilador de deixar ela voltar). Decisão do proprietário,
   perguntada explicitamente — é remoção de feature, não fix mecânico. Teste de integração novo
   trava a regra; confirmado que falha ao recolocar a transição.
2. **Tentativa de pagamento órfã em `PENDENTE` para sempre.** `criarIntencao` commita o
   `Pagamento` numa transação e confirma o resultado noutra (deliberado — é a forma de um provedor
   real). Se a segunda falhasse por motivo alheio ao provedor (blip de banco, e este projeto já
   viu instabilidade de pooler antes), a tentativa ficava `PENDENTE` sem ninguém para reprocessá-la
   — o evento só existia em memória, e o retry do cliente criava outra linha em vez de retomar a
   anterior. Corrigido resolvendo a tentativa como `RECUSADO` com motivo explícito, o que reaproveita
   a UX já existente de cartão recusado (pedido continua `PENDENTE`, cliente tenta de novo).
   Verificado por teste que injeta falha no `processarWebhook`; confirmado que falha sem o fix.
3. **Resposta perdida deixava o comprador achando que não pagou.** Se o POST de pagamento fosse
   processado no servidor mas a resposta (ou o GET seguinte) se perdesse, o `catch` do formulário
   só mostrava erro genérico e liberava "Pagar" de novo — a tela seguia mostrando `PENDENTE` de um
   pedido já `PAGO`, e a nova tentativa batia num 409 sem explicação. Corrigido delegando a falha
   ambígua ao mecanismo de "Atualizar pedido" do componente pai (`precisaAtualizar`), que já
   existia para exatamente esta classe de erro nas outras ações — era o padrão da casa, só não
   tinha sido ligado no caminho novo.

Descartados pelo Codex depois de investigar: assinatura (nenhum bypass; alterar qualquer campo
assinado invalida o HMAC), janela de replay, exposição da rota pública do webhook, injeção de
valor/status pelo cliente e acesso a pagamento alheio.

### Fase Final do roadmap — dois achados de processo (2026-09-10)

Fecha o núcleo comercial: 68 unitários + 36 de integração, `tsc` limpo, banco de desenvolvimento
auditado e limpo. Os dois achados não estavam previstos e valem mais que o checklist em si.

- **A varredura de comentário solto voltou com 47 ocorrências**, não vazia. A regra existe no
  `CLAUDE.md` desde 2026-09-04 (quando 28 violações foram corrigidas) e mesmo assim as Fases 2, 3 e
  4 introduziram violações novas. Todas corrigidas. **Rodar a varredura por fase, não só no fim** —
  no fim ela vira uma dívida grande de uma vez, e o custo de mover 47 comentários é bem maior que o
  de escrever cada um já no lugar certo.
- **`DELETE` de pedido não devolve estoque — a rotina de limpeza corrompeu dado de desenvolvimento
  em silêncio.** Quem devolve estoque é `atualizarSituacao` no caminho de cancelamento, com
  `estornarEstoque`; um `DELETE` direto em `orders`/`order_items` remove a linha e pronto. A
  limpeza da Fase 4 apagou dois pedidos assim, e o produto Mouse ficou com 2 unidades em vez de 4.
  Ninguém teria notado sem a auditoria. **Script de limpeza que apaga pedido precisa devolver o
  estoque junto**, ou cancelar pelo serviço antes de apagar.

Estado do banco de desenvolvimento depois da auditoria (autorizada explicitamente): 3 usuários
reais, 1 produto (Mouse, estoque 4), 1 categoria (Eletronicos), zero pedidos. Removidos 4 usuários
de teste, 3 pedidos, 12 categorias e 1 produto acumulados ao longo de várias sessões — incluindo
categorias com nome de tentativa de SQL injection, resquício de teste de segurança antigo.

**Nota de processo, achada ao reaplicar isto:** esta seção e a varredura inteira já tinham sido
escritas uma vez e sumiram do disco entre uma rodada e outra, provavelmente porque os commits da
varredura tocavam os mesmos arquivos dos commits da revisão adversarial, entregues antes. O que
sobreviveu foi exatamente o que já tinha sido commitado. Quando uma rodada de trabalho reescreve
arquivos de uma rodada anterior ainda não commitada, **commitar a primeira antes de começar a
segunda** evita perder a segunda inteira.

## Filtro de status em `GET /orders` — 2026-09-08

Spec: `docs/superpowers/specs/2026-09-08-filtro-status-pedidos-design.md`. Preparação para a futura
tela admin de gestão de pedidos poder filtrar por situação — sem ela ainda.

`GET /orders?situacao=PAGO` — um valor por vez, opcional, `PENDENTE`/`PAGO`/`CANCELADO`. Vale tanto
para cliente (filtra os próprios) quanto para admin (filtra todos): combina com AND ao filtro de
dono já existente, mesmo objeto `where` do TypeORM. Valor fora do enum responde 400 via `@IsEnum`
(`ConsultaDePedidosDto extends ConsultaPaginadaDto`, mesmo molde de `ConsultaDeProdutosDto`). Sem o
parâmetro, comportamento anterior preservado integralmente — verificado por `curl` contra o backend
real: `?situacao=CANCELADO` devolveu só os 2 pedidos cancelados de um total de vários; valor inválido
(`XPTO`) devolveu 400; sem parâmetro devolveu a lista completa como antes.

Arquivo novo: `src/modules/pedidos/dto/consulta-de-pedidos.dto.ts`. Modificados:
`pedidos.controller.ts` (`@Query()` troca de tipo), `pedidos.service.ts` (`where.situacao` condicional
antes do `findAndCount`).

## Bug real — `PATCH /orders/:id/status` não devolvia itens — 2026-09-08

Encontrado durante o clique real do fluxo de compra do frontend (`projeto-test-web`), primeira vez
que uma tela consumiu o campo `itens` do retorno de uma mudança de situação. `atualizarSituacao`
(`src/modules/pedidos/pedidos.service.ts`) fazia `manager.findOne(Pedido, { lock: { mode:
'pessimistic_write' } })` sem `relations: { itens: true }` — carregar a relação junto com o lock
pessimista vira um outer join, que o Postgres recusa travar (mesma razão já documentada no método
vizinho `estornarEstoque`). O endpoint sempre devolveu `itens: undefined`; nenhuma rota nem teste
anterior renderizava esse campo, então ficou invisível até a tela `TelaDeDetalheDoPedido` do frontend
tentar `pedido.itens.map` depois de cancelar um pedido — `TypeError`, error boundary do React.
Corrigido carregando os itens à parte, depois do `save`, mesmo padrão já usado em `estornarEstoque`:

```ts
pedido.situacao = dto.situacao;
const salvo = await manager.save(pedido);
salvo.itens = await manager.findBy(ItemDoPedido, { pedidoId: id });
return salvo;
```

Verificado com o fluxo completo repetido do zero contra o banco real (novo pedido, cancelamento,
situação mudando para `CANCELADO` na tela, itens permanecendo visíveis, zero erro de console).

## Dívidas conhecidas (decisões conscientes, não esquecimento)

1. **Testes automatizados restritos a `auth`, e só em nível de unidade.** Plano:
   `docs/superpowers/plans/2026-09-08-restaurar-testes-auth.md`. 47 testes cobrindo `SenhaService`,
   `SenhasVazadasService` (HIBP, k-anonimato, cancelamento real por `AbortSignal`), `SessoesService`
   (rotação de refresh, revogação de família em reuso, logout idempotente), `EstrategiaJwt` e guards
   (regressão de `request.user`→`request.usuario`), `AutenticacaoService.login` (paridade de resposta
   entre conta inexistente/bloqueada/senha errada/email não verificado, timing real via fake timers)
   e um smoke test de boot do módulo via `Test.createTestingModule`. Escrita do zero contra o código
   atual, não restaurada do git (a sessão nunca roda `git`, e a suíte antiga era pré-refatoração
   PT-BR de qualquer forma).

   **Atualização de 2026-09-09: o gap abaixo foi fechado.** `test/integracao/sessoes.int-spec.ts`
   cobre os três pontos contra Postgres real. Um deles rendeu uma lição: o primeiro teste de
   concorrência que escrevi (`duas rotações simultâneas, uma vence`) passava **com e sem os locks** —
   provava a consequência, não o mecanismo. Foi substituído por um caso com duas conexões e barreira
   explícita: A trava a linha, B fica pendurada 400ms, A commita, B destrava. Esse falha de verdade
   quando o `pessimistic_write` sai. O caso antigo ficou no arquivo, com comentário dizendo que ele
   sozinho não prova nada — serve de aviso para quem for escrever o próximo.

   **Gap histórico, apontado por revisão adversarial (Codex) antes de ser fechado:**
   `sessoes.service.spec.ts` usa um `FakeEntityManager` escrito à mão (não TypeORM real) para simular
   `transaction`/`findOne`/`save`/`update`. Isso prova a lógica de decisão (branches, mensagens,
   revogação em memória), mas **não prova**: rollback real de uma transação que lança exceção depois
   de já ter revogado a família (no Postgres real isso desfaz a revogação — o fake não desfaz nada);
   que os locks (`pessimistic_write`) de fato serializam operações concorrentes (o teste de "ordem de
   lock" só prova ordem de chamadas de um método já stubado, não bloqueio real); que
   `validarSessaoAtiva` filtra de verdade por `usuarioId`/`revogadoEm`/`expiraEm` no banco (o mock do
   repositório ignora os critérios da query). O smoke test de boot também não pegaria de volta a
   classe de bug real já registrada abaixo (`@Index` desalinhado) porque os repositórios são
   substituídos por objetos vazios — a validação de metadados do TypeORM nunca roda.

   Fechar esse gap exige teste de integração contra Postgres real (`TEST_DATABASE_URL`, já citado
   em sessão anterior de auth JWT), com conexões concorrentes de verdade para os cenários de lock —
   não é extensão do unit test, é uma categoria de teste diferente. Não perguntado nem decidido nesta
   rodada; próximo passo natural quando o projeto voltar a mexer em `SessoesService`.

   **Demais módulos** (`produtos`, `categorias`, `pedidos`, cadastro/verificação/recuperação de senha
   dentro do próprio `auth`) continuam sem nenhum teste automatizado — os 25 arquivos originais
   (153 testes) seguem recuperáveis do histórico do git, no commit imediatamente anterior à remoção
   de 2026-08-31: `git checkout <commit-anterior> -- "src/**/*.spec.ts" test/`.
2. ~~**Dinheiro em ponto flutuante.**~~ **Resolvido em 2026-09-09** — ver a seção "Dinheiro em
   centavos inteiros". Ficou uma limitação consciente no lugar: `integer` comporta até
   R$ 21.474.836,47 por valor. Suficiente para este catálogo; se algum dia precisar de mais, a troca
   é para `bigint`, que o TypeORM devolve como string e exigiria um transformador.
3. **TOCTOU nas checagens de dependência.** Em `produtos.service` e `categorias.service`, `count` e
   `remover` não são atômicos. A FK protege o dado, mas o erro `23503` viraria 500 em vez de 409.
4. **Sem carrinho, pagamento, endereço, frete, cupom ou avaliação** — fora de escopo por decisão.

## Refatoração PT-BR — 2026-09-04

Backend inteiro (71 arquivos, migrations excluídas de propósito) e o frontend (`projeto-test-web`)
tiveram nomes de arquivo, classe, método, variável, propriedade de entidade e propriedade de DTO
traduzidos para português. Rotas HTTP (`/auth`, `/products`, `/categories`, `/orders`), nomes de
tabela (`@Entity('products')` etc.) e valores de enum já persistidos (`ADMIN`, `PENDENTE`...) ficaram
intocados — mudar qualquer um deles exigiria migração de schema ou de dados. Migrations preservam o
nome de classe original: o TypeORM grava esse nome na tabela `migrations`, renomear faria ele achar
que a migration nunca rodou.

**O contrato HTTP mudou.** Toda propriedade de entidade e DTO virou PT-BR — o JSON que a API devolve
e espera também mudou (`price`→`preco`, `categoryId`→`categoriaId`, `page`→`pagina`, `data`→`dados`,
`role`→`papel`, etc.). O frontend foi atualizado na mesma leva. Qualquer cliente externo desta API
(script, Postman salvo, outro frontend) quebra até ser atualizado — não é acidente, é o objetivo da
mudança.

**Dois bugs reais só apareceram testando contra o banco de verdade, não no `tsc`:**

1. **`@Index(['userId', ...])` em array de propriedade não acompanha o rename da propriedade.**
   O TypeORM valida esse array contra os nomes de propriedade da classe, não contra o `name:` da
   coluna — renomear a propriedade sem atualizar o array quebra o boot (`Index contains column
   that is missing in the entity`). Afetou `SessaoDeAutenticacao`, `TokenDeRenovacao`,
   `TokenDeAcao`. O `tsc` não pega isso: o array é `string[]`, não checado contra o shape da
   entidade.
2. **Passport grava o usuário autenticado em `request.user`, nome fixo do framework, não
   configurável sem opção extra.** A varredura de rename trocou `request.user` por
   `request.usuario` em `GuardaDePapel`, `UsuarioAtual` (decorator) e `RequisicaoAutenticada`
   (controller) — isso silenciosamente quebrava **toda** rota que dependesse de usuário
   autenticado (inclusive `/orders` inteiro, sem relação com papel), porque `request.usuario`
   nunca existia. `tsc` não pega: o tipo do `getRequest<T>()` é o `T` que o próprio código
   declara, então declarar `{ usuario: UsuarioPublico }` "prova" a si mesmo. Só apareceu testando
   login + rota protegida de verdade. Ponto de atenção permanente: **nunca renomear a propriedade
   que armazena o resultado de `PassportStrategy.validate()`** — o `UsuarioPublico` retornado pode
   ter qualquer nome de campo em PT-BR, mas o campo do `Request` em si (`request.user`) é do
   framework.

Também corrigidos nesta refatoração: `package.json`'s `seed:admin` script apontava para o arquivo
antigo `seed-admin.ts` (renomeado para `promover-admin.ts`) — quebrado até a verificação end-to-end
rodar o comando de verdade; um `createQueryBuilder('user')` com alias `'user'` mas `.where`/`.addSelect`
referenciando `'usuario.'` (a varredura de rename trocou dentro da string SQL, alias e referência
ficaram desalinhados); dois `manager.create(Entidade, { chaveAntiga: valor })` com chave de objeto
literal desalinhada da propriedade renomeada (`passwordHash`/`expiresAt`/`items` como chave, gravando
`null` ou nada em produção — `DeepPartial<T>` do TypeORM não força checagem de excesso de propriedade
em todos os casos); um `b` sobrando em `criarOpcoesDaFonteDeDadosb` (erro de digitação num `sed` que
usei na própria refatoração, inofensivo porque os 3 pontos de uso tinham o mesmo erro, mas feio).

**Achados do Codex em 2026-09-08** (revisão adversarial pendente desde a sessão da refatoração —
Codex ficou sem crédito a sessão inteira; rodada de novo dias depois, `codex exec review
--uncommitted`, achados pela própria exploração do agente antes do veredito formal, timeout de 280s
não foi suficiente para ele terminar a leitura completa): `package.json`'s script `typeorm` ainda
apontava para `src/db/data-source.ts` (renomeado para `fonte-de-dados.ts`) — quebrava
`migration:generate`/`migration:run`/`migration:revert`/`migration:show`, todo o fluxo de CLI de
migration; `README.md` documentava o contrato antigo em inglês (`?page=1&limit=20`,
`{"data":[],"page":1,"limit":20}`, `?categoryId=`, `?name=`, `role`) — a seção "Endpoints" nunca foi
atualizada junto com o resto da refatoração. Ambos corrigidos e `npm run typeorm -- migration:show`
confirmado funcionando (as 11 migrations aparecem `[X]`, provando que a preservação de nome de classe
funcionou de verdade).

Verificação: suite completa de `curl` contra o banco real do Supabase (mesmo usado no
desenvolvimento) — registro, verificação por `.emails-dev/`, login, `GET /auth/me`, criar/editar
categoria e produto como ADMIN, criar pedido, transição de situação PENDENTE→PAGO→CANCELADO, os dois
409 de conflito de dependência. Todos bateram com o contrato PT-BR documentado acima.

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

  Esta regra estava escrita e mesmo assim foi violada em 28 pontos de 14 arquivos, corrigidos em
  2026-09-04. Antes de fechar qualquer mudança, rodar a varredura — ela lista todo `//` que não
  está dentro de uma caixa, e o resultado precisa vir vazio:

  ```bash
  find src -name "*.ts" | while read -r f; do
  awk -v F="$f" '{t=$0; sub(/^[ \t]+/,"",t)}
    t ~ /^\/\/ *-{3,} *$/ { inbox = !inbox; next }
    inbox { next }
    t ~ /^\/\// { print F ":" NR ": " t }' "$f"
  done
  ```
- **Pasta só existe quando agrupa mais de um arquivo.** Reorganização de 2026-08-31: uma pasta
  `entities/` com uma única entidade some e o arquivo sobe para a raiz do módulo (`categorias`,
  `produtos`, `usuarios`); onde há coleção real, a pasta fica (`auth/entities` com 3,
  `pedidos/entities` com 2). Mesma regra aplicada a `auth/interceptors` e `auth/strategies`, que
  tinham um arquivo cada. A estrutura reflete o conteúdo, não simetria decorativa.
- **`src/scripts/seed-admin.ts` precisa ficar dentro de `src/`.** Enquanto viveu em `scripts/` na
  raiz, ampliava a raiz de compilação e o build gerava `dist/src/main.js`, enquanto `start:prod`
  aponta para `dist/main` — ou seja, `start:prod` estava quebrado e ninguém notou, porque em
  desenvolvimento se usa `start` e `start:dev`.
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
| `npx tsc -p tsconfig.build.json --noEmit` | Checagem de tipos |
| `npm run format` | Prettier |
| `npm run migration:run` / `migration:revert` | Migrations |
| `npm run seed:admin -- <email> --confirm-target=...` | Promove usuário a ADMIN |
| `npm test` | Testes unitários (Jest) |
| `npm run test:db:up` / `test:db:down` | Sobe/derruba o Postgres de teste (Docker) |
| `npm run test:integration` | Testes de integração (exige `test:db:up` antes) |

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
