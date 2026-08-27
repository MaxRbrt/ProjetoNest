# Comentários PT-BR e pastas de domínio — design

**Data:** 2026-08-27
**Branch:** `feat/autorizacao-ownership`

## Contexto

A documentação por blocos funcionais foi adicionada no commit `49675ce` e já faz parte do histórico
atual. Depois desse trabalho, a branch de autorização e ownership criou e alterou novos arquivos
TypeScript, que também precisam entrar na documentação.

O projeto possui 82 arquivos `.ts` sob `src/` no início desta revisão. Parte deles ainda não tem um
cabeçalho funcional porque são DTOs, entidades, módulos ou testes pequenos. O proprietário pediu uma
nova passagem arquivo por arquivo e decidiu traduzir as pastas de domínio, com exceção de `auth`.

## Objetivos

- Revisar individualmente todos os `.ts` sob `src/`.
- Organizar cada arquivo em blocos funcionais com comentários em português brasileiro.
- Explicar somente decisões não óbvias, como locks, transações, ordem de operações e proteções de
  segurança.
- Traduzir as pastas dos domínios de catálogo, pedidos e usuários.
- Preservar integralmente o comportamento e o trabalho em andamento de autorização e ownership.

## Renomeações aprovadas

| Origem | Destino |
|---|---|
| `src/modules/categories/` | `src/modules/categorias/` |
| `src/modules/orders/` | `src/modules/pedidos/` |
| `src/modules/products/` | `src/modules/produtos/` |
| `src/modules/users/` | `src/modules/usuarios/` |

`src/modules/auth/` permanece em inglês por decisão explícita do proprietário. `src/modules/email/`
também permanece, pois o termo já é usado em português e a mudança não agregaria significado.

## Convenção de nomes

- Pastas técnicas permanecem em inglês: `modules`, `dto`, `entities`, `services`, `guards`,
  `interceptors`, `strategies`, `config`, `db`, `decorators`, `interfaces` e `utils`.
- Nomes de arquivos permanecem em inglês.
- Classes, métodos, propriedades, variáveis e tipos permanecem em inglês.
- Rotas HTTP permanecem inalteradas, incluindo `/categories`, `/products`, `/orders` e `/auth`.
- Somente caminhos de importação relativos mudam em consequência das pastas movidas.

Essa separação mantém compatibilidade com as convenções do NestJS e TypeORM sem impedir que a
organização visual dos domínios fique em português.

## Estratégia de comentários

Cada arquivo será classificado durante a revisão:

- Controllers e services: cabeçalhos por caso de uso ou fluxo público.
- Testes: cabeçalhos por grupo de cenários; nomes de `describe` e `it` em PT-BR, exceto identificadores
  de classes e símbolos técnicos.
- DTOs: blocos por responsabilidade de validação.
- Entidades: blocos para identidade, relacionamentos, estado e auditoria quando aplicável.
- Módulos e arquivos de composição: bloco que identifique a responsabilidade de integração.
- Migrations: separação entre aplicação, etapas de schema e reversão.
- Decorators, guards, interceptors e strategies: bloco que explique o papel na fronteira HTTP ou de
  segurança.

Arquivos de responsabilidade única recebem no máximo um cabeçalho navegável. Não serão adicionados
comentários linha a linha que apenas repitam o código.

## Preservação do trabalho existente

O working tree contém implementação ainda não commitada de autorização e ownership, incluindo
alterações em usuários, uma migration e decorators novos. Esses arquivos serão documentados, mas sua
lógica não será reescrita.

Antes de cada lote, o diff existente será separado do diff de documentação. Movimentos usarão os
caminhos exatos aprovados e todos os imports afetados serão atualizados. O arquivo não rastreado `o`
não faz parte deste trabalho e não será alterado.

## Verificação

A execução será incremental por domínio. Ao final:

1. Auditar que as únicas mudanças executáveis são caminhos de importação causados pelos movimentos.
2. Confirmar que nenhuma rota, assinatura, mensagem, tipo ou identificador foi renomeado.
3. Executar `npx tsc -p tsconfig.build.json --noEmit`.
4. Executar `npx jest` e comparar com o baseline obtido antes das mudanças.
5. Executar `npm run format`.
6. Repetir `tsc` e Jest após a formatação.
7. Conferir `git diff --check` e tratar diferenças artificiais de fim de linha sem incluir arquivos
   semanticamente inalterados.

Nenhuma migration será executada e o conteúdo de `.env` não será lido ou impresso.

## Critérios de conclusão

- As quatro pastas aprovadas foram movidas e todos os imports compilam.
- `auth`, `email`, pastas técnicas, arquivos, identificadores e rotas mantêm seus nomes.
- Todos os 82 arquivos TypeScript existentes no início da revisão foram inspecionados.
- Os arquivos novos de autorização e ownership estão documentados em PT-BR.
- TypeScript, Jest e Prettier terminam com sucesso.
- O diff não contém refatoração ou alteração de comportamento.
