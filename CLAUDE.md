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
| Pedidos | Criação transacional com baixa de estoque e lock pessimista, idempotência por `Idempotency-Key`, ciclo de vida (`PENDENTE`/`PAGO`/`CANCELADO`) com estorno de estoque no cancelamento |
| Persistência | 11 migrations versionadas, `synchronize` desligado, RLS ativo |
| Documentação da API | OpenAPI em `/docs`, desligado quando `NODE_ENV=production` |
| Testes | **Nenhum.** Os 153 testes unitários foram removidos em 2026-08-31 — ver dívidas |

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

1. **Nenhum teste automatizado.** Os 25 arquivos de teste (153 testes) e o esqueleto de E2E foram
   removidos em 2026-08-31, por decisão do proprietário, para reduzir o volume do código-fonte. Eles
   não pesavam em produção — o `tsconfig.build.json` já os excluía do `dist` —, então a remoção é
   sobre navegação do repositório, não sobre o artefato publicado.

   **Estão recuperáveis do histórico do git**, no commit imediatamente anterior ao da remoção:
   `git checkout <commit-anterior> -- "src/**/*.spec.ts" test/`.

   Consequência a considerar antes de mexer em autenticação, sessão ou concorrência: não há mais
   rede de proteção. A suíte removida pegou, nesta mesma sessão, um segundo validador de senha
   escondido no serviço, cinco corridas de sessão no frontend e um travamento sob StrictMode —
   nenhum deles visível em teste manual. Se o projeto voltar a evoluir nessas áreas, vale restaurar
   ao menos os testes de `auth`. É a dívida mais relevante da lista.
2. **Dinheiro em ponto flutuante.** `Produto.preco`, `Pedido.total` e `ItemDoPedido.precoUnitario`
   usam `float`. O correto é `numeric(12,2)`, mas o TypeORM devolve `numeric` como **string**, o que
   quebraria todo cálculo de total, comparação de estoque e testes. Merece subprojeto próprio.
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
