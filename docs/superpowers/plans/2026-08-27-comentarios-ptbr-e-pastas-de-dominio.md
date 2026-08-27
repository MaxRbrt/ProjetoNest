# Comentários PT-BR e pastas de domínio — plano de implementação

**Objetivo:** traduzir quatro pastas de domínio e concluir a revisão de comentários PT-BR no snapshot
atual de 83 arquivos TypeScript, preservando o trabalho não commitado de autorização e ownership.

**Arquitetura:** somente os diretórios de domínio mudam. Arquivos, identificadores, rotas, entidades,
tabelas e SQL permanecem em inglês. A documentação usa cabeçalhos por responsabilidade funcional e
explicações curtas apenas para decisões não óbvias.

**Spec:** `docs/superpowers/specs/2026-08-27-comentarios-ptbr-e-pastas-de-dominio-design.md`

## Restrições globais

- Manter `src/modules/auth` e `src/modules/email` como estão.
- Manter pastas técnicas, nomes de arquivos, classes, métodos, propriedades e variáveis em inglês.
- Manter as rotas `/categories`, `/products`, `/orders` e `/auth` inalteradas.
- Preservar integralmente as sete alterações funcionais rastreadas e os quatro `.ts` novos da branch
  de autorização.
- Não alterar, remover, preparar ou commitar o arquivo não rastreado `o`.
- Não executar migrations, acessar banco ou ler `.env`.
- Não usar `git mv`, `git reset`, `git checkout`, `git restore`, `git clean` ou `git add -A`.
- Tratar diferenças de CRLF/LF separadamente das mudanças semânticas.

---

## Fase 0: descoberta documental e baseline

### Fontes permitidas

- Design aprovado:
  `docs/superpowers/specs/2026-08-27-comentarios-ptbr-e-pastas-de-dominio-design.md`.
- Padrão de cabeçalho existente:
  `src/modules/auth/auth.service.ts`, `src/modules/auth/services/sessions.service.ts` e
  `src/modules/orders/orders.service.ts`.
- Descoberta de entidades do TypeORM: `src/db/database-options.ts`, com o glob genérico
  `../modules/**/*.entity{.ts,.js}`.
- Comandos oficiais do projeto: `package.json` (`format` e configuração Jest).
- Plano de autorização em andamento:
  `docs/superpowers/plans/2026-08-27-autorizacao-ownership.md`.

### APIs e operações permitidas

- `Move-Item -LiteralPath` para os quatro movimentos exatos, depois de validar origem e destino.
- Imports relativos TypeScript; nenhuma configuração de alias ou API nova será criada.
- `npx.cmd tsc -p tsconfig.build.json --noEmit` para código de produção.
- `npx.cmd jest` para specs, que são excluídos do build TypeScript.
- `npm.cmd run format` para a verificação obrigatória do Prettier.
- `rg` e `git diff --ignore-space-at-eol` para auditoria read-only.

### Estado inicial confirmado

- Branch `feat/autorizacao-ownership`, sem arquivos staged.
- 83 `.ts` sob `src/`: 79 no HEAD e quatro novos.
- Sete arquivos rastreados têm mudanças funcionais reais de autorização.
- Outros arquivos marcados como modificados são principalmente ruído de EOL com
  `core.autocrlf=true`.
- Quatro pastas de domínio contêm 21 arquivos e há 27 imports afetados.

### Verificação da fase

- [ ] Capturar `git status`, `git diff --ignore-space-at-eol` e a lista de não rastreados.
- [ ] Rodar TypeScript e Jest para obter o baseline atual da branch.
- [ ] Confirmar que os quatro destinos não existem e estão dentro do workspace.

### Anti-padrões

- Não reutilizar a contagem antiga de 17 suítes/69 testes sem medir o branch atual.
- Não usar `git status` puro para decidir se um arquivo mudou semanticamente.
- Não iniciar movimentos enquanto houver dúvida sobre origem ou destino.

---

## Fase 1: mover pastas e atualizar imports

### Movimentos exatos

| Origem | Destino |
|---|---|
| `src/modules/categories` | `src/modules/categorias` |
| `src/modules/orders` | `src/modules/pedidos` |
| `src/modules/products` | `src/modules/produtos` |
| `src/modules/users` | `src/modules/usuarios` |

Executar um domínio por vez com `Move-Item -LiteralPath`, sem staging.

### Imports a atualizar

- Composição: `src/app.module.ts`.
- Decorator: `src/decorators/current-user.decorator.ts`.
- Auth consumindo usuários: controller, módulo, service/spec, strategy, entidades e services/specs.
- Relações cruzadas: `categorias ↔ produtos`, `produtos ↔ pedidos` e `pedidos → usuarios`.
- Imports internos como `./categories.service` e nomes de arquivos permanecem intactos.

### Verificação por incremento

- [ ] Após `usuarios`, atualizar consumidores e rodar `tsc`.
- [ ] Após `categorias` e `produtos`, atualizar as duas direções e rodar `tsc`.
- [ ] Após `pedidos`, atualizar produtos/pedidos e rodar `tsc`.
- [ ] Buscar referências executáveis aos segmentos antigos com `rg`.
- [ ] Rodar Jest completo para confirmar a descoberta dos specs nos caminhos novos.
- [ ] Confirmar que `@Controller(...)`, `@Entity(...)` e SQL continuam em inglês.

### Anti-padrões

- Não substituir globalmente as palavras `categories`, `orders`, `products` ou `users`.
- Não alterar o glob do TypeORM, rotas, nomes de tabela, classes ou arquivos.
- Não esquecer que o plano de autorização antigo ainda cita os caminhos anteriores; usar a tabela de
  equivalência deste plano ao continuar aquele trabalho.

---

## Fase 2: completar comentários nos arquivos que precisam de blocos

### Configuração e banco

- `src/config/env.validation.spec.ts`: configuração válida/valores padrão, obrigatoriedade/segredos e
  limites/URLs.
- `src/db/data-source.spec.ts`: conexão normal e isolamento do banco de testes.

### Autenticação

- `auth.controller.spec.ts`: login, rotação e logout.
- `auth.module.ts`: persistência/integrações, JWT e composição dos providers.
- `dto/auth-dtos.spec.ts` e `dto/email.dto.ts`: normalização e validação sem alterar senha.
- Entidades de token de ação, sessão e refresh: identidade, vínculos, segredo e ciclo de vida.
- Specs de guards, password, Pwned Passwords, cookie e strategy: grupos de cenários.
- `no-store.interceptor.ts`: proteção contra cache de respostas sensíveis.
- `jwt-auth.guard.spec.ts`: exceção pública e proteção padrão.

### Demais domínios após os movimentos

- `categorias/categories.module.ts`: composição do domínio.
- `email/email.module.ts` e `resend-email.service.spec.ts`: binding do cliente, fluxos e erro externo.
- `pedidos/entities/order-item.entity.ts` e `pedidos/orders.module.ts`: dados e vínculos do item,
  composição do domínio.
- `produtos/entities/product.entity.ts` e `produtos/products.module.ts`: dados comerciais, categoria,
  dependência com pedidos e composição.
- `usuarios/users.module.ts` e `usuarios/users.service.spec.ts`: persistência/exposição e projeção
  pública com papel.

### Ajustes de idioma em comentários e testes

- “Health check” → “Verificação de disponibilidade”.
- “defaults” → “valores padrão”.
- “Data source” → “Fonte de dados”.
- “idempotency key” → “chave de idempotência”.
- “request protegido” → “requisição protegida”.

### Arquivos deliberadamente sem novo separador

Quinze arquivos de responsabilidade mínima não receberão cabeçalho adicional: `app.service.ts`, o
spec simples do controller raiz, DTOs unitários de auth/categorias/produtos, specs unitários de access
token e token opaco, `category.entity.ts` e `order.entity.ts`. Eles serão inspecionados, mas um bloco
repetiria integralmente o único símbolo do arquivo.

### Verificação da fase

- [ ] Revisar os 83 caminhos no inventário e marcar os 43 já documentados, 25 alterados e 15 sem
  mudança deliberada.
- [ ] Confirmar que comentários existentes de autorização foram preservados.
- [ ] Não descrever ownership ainda não implementado.
- [ ] Rodar `tsc` e Jest após o lote.

---

## Fase 3: formatação e auditoria final

- [ ] Rodar `npx.cmd tsc -p tsconfig.build.json --noEmit`.
- [ ] Rodar `npx.cmd jest` e comparar com o baseline da Fase 0.
- [ ] Rodar `npm.cmd run format`.
- [ ] Repetir TypeScript e Jest após o Prettier.
- [ ] Rodar `git diff --check`.
- [ ] Usar `git diff --find-renames --ignore-space-at-eol` para confirmar os quatro movimentos.
- [ ] Separar no relatório final: alterações de autorização preexistentes, movimentos/imports e
  comentários desta tarefa.
- [ ] Confirmar que `o` permanece intocado e que nenhuma migration foi executada.

### Critérios de conclusão

- Quatro pastas movidas, 27 imports atualizados e nenhuma referência executável antiga.
- Rotas, tabelas, SQL, arquivos e identificadores inalterados.
- 83 arquivos inspecionados; 25 recebem documentação adicional conforme o inventário atual.
- TypeScript, Jest, Prettier e `git diff --check` passam.
- Nenhuma alteração comportamental nova além do trabalho de autorização que já existia no baseline.
