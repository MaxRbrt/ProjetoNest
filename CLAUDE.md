# CLAUDE.md — projeto-test

Projeto de estudo em NestJS + TypeORM + Postgres (Supabase). Objetivo é aprender os mecanismos por
dentro (auth manual, autorização, persistência), não usar serviços gerenciados que escondam o
funcionamento.

## Protocolo de retomada (ler isto primeiro, antes de reler código)

Este projeto é conduzido por planos SDD (`superpowers:subagent-driven-development`). Cada subprojeto
vive em `.superpowers/sdd/<data>-<slug>/`, com plano em `docs/superpowers/plans/` e spec em
`docs/superpowers/specs/`.

1. Achar o subprojeto mais recente: `.superpowers/sdd/` ordenado por data no nome da pasta.
2. Ler `progress.md` inteiro daquela pasta — é o ledger, fonte da verdade sobre o que foi feito,
   revisado e decidido (rulings). **Não parar na última seção com título** — o arquivo pode terminar
   no meio de uma task se a sessão anterior caiu por limite de contexto. Confirme visualmente que a
   última linha do arquivo é uma conclusão de task ("Task N: completa...") e não um cabeçalho vazio.
3. Cruzar com a realidade: para cada `task-N-brief.md` sem `task-N-report.md` correspondente, ou sem
   entrada no ledger, checar se o código já existe no `src/` mesmo assim. Já aconteceu (Tasks 6-8 do
   subprojeto `autorizacao-ownership`, 2026-08-28) de uma sessão implementar tudo, aplicar migration
   real no banco, e cair antes de escrever o relatório e a entrada do ledger. **Não reimplementar por
   via das dúvidas** — verificar primeiro (`tsc --noEmit`, `npx jest`, ler o diff mental contra o
   brief), documentar a lacuna encontrada, e seguir para revisão em vez de reescrever.
4. Se há trabalho implementado sem revisão adversarial registrada no ledger (nem revisor SDD nem
   Codex), isso é o que falta antes de considerar a task "pronta" — não é preciso refazer
   implementação.
5. `git status`/`log`/`diff` **não podem ser usados pela sessão** (regra dura do usuário, reforçada
   por hook). Nenhuma task deste projeto tem commit feito pela IA — todo estado vive no working tree.
   Cada task fechada no ledger já vem com a lista de arquivos prontos para commit; o comando de commit
   é sempre entregue ao usuário, nunca executado.

## Convenções do projeto

- Comentários, mensagens de erro/log e documentação: **PT-BR**. Identificadores de código
  (variáveis, funções, classes): **inglês**. Comentários agrupados por bloco funcional
  (`// ----` + título), inclusive em migrations triviais — ver qualquer migration em
  `src/db/migrations/` como referência de formato.
- Nomes de pasta de módulo estão **mistos de propósito**: `src/modules/auth/` e
  `src/modules/email/` em inglês (não tocar); `src/modules/usuarios/`, `produtos/`, `categorias/`,
  `pedidos/` em português (renomeados fora do fluxo SDD em 2026-08-27, aceito como está — ver ledger
  do subprojeto `autorizacao-ownership`). Nomes de **arquivo** dentro dessas pastas continuam em
  inglês (`orders.service.ts` dentro de `pedidos/`). Não normalizar sem pedido explícito do usuário.
- Commits em lotes de ~3 arquivos, um comando de commit por task fechada no ledger — nunca em lote
  gigante no fim.
- Revisão adversarial (Codex, `cc-skill-codex:codex`) acontece **uma vez no fechamento do
  subprojeto inteiro**, não por task individual — ruling já registrado no ledger da Task 4 de
  `autorizacao-ownership`. Rodar por task é desperdício; rodar zero vezes deixa mudança de auth sem
  segunda opinião.

## Quirks de ambiente (Windows, evitar redescobrir)

- `npx ts-node -e "import('./src/db/data-source')..."` falha aqui com
  `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` (import dinâmico + `-e` no Node do Windows). Alternativa:
  escrever um script `.ts` temporário equivalente na raiz, rodar com `npx ts-node arquivo.ts`, apagar
  em seguida.
- O wrapper `codex-ask.sh` da skill `cc-skill-codex:codex` falha aqui (`python3` no PATH é o stub do
  Windows Store, não um Python real). Usar o fallback inline da própria skill (`codex exec` direto via
  heredoc, sem o wrapper) — está documentado no apêndice da skill.
- Processo `node dist/main` obsoleto pode ficar preso na porta 3000 entre sessões — verificar antes de
  testar rota manualmente (já mascarou teste uma vez, ver ledger da Task 3 de `autorizacao-ownership`).

## Mapa de documentação

- `docs/decisions/` — ADRs (decisões arquiteturais de longo prazo, ex.: por que JWT manual em vez de
  Supabase Auth).
- `docs/superpowers/specs/` — spec de cada subprojeto (desenho técnico revisado antes da implementação).
- `docs/superpowers/plans/` — plano de tasks de cada subprojeto.
- `.superpowers/sdd/<slug>/` — execução: briefs, reports e `progress.md` (ledger). **Este é o
  arquivo com maior densidade de contexto por token lido — sempre começar por ele.**
- `docs/auditorias/` — achados de auditoria de segurança consolidados por subprojeto.
- `docs/prompts/comentarios-ptbr.md` — regra de idioma em detalhe, se este resumo não bastar.
