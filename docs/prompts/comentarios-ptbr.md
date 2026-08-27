# Prompt para o Codex — comentários PT-BR por bloco funcional

Copie tudo abaixo da linha e envie ao Codex.

---

Você vai documentar em português brasileiro uma API NestJS existente, adicionando comentários
organizados por bloco funcional. Esta é uma tarefa de DOCUMENTAÇÃO, não de refatoração.

Projeto: `C:\Users\Marcos.Santos\Documents\ProjetoNest.js\projeto-test`
Branch atual: `feat/autenticacao-jwt`

## Regra do projeto (definida pelo dono)

- Comentários, mensagens de erro/API, documentação e nomes de teste (`it('...')`, `describe('...')`): **português brasileiro**.
- Identificadores (variáveis, métodos, classes, propriedades, nomes de arquivo): **permanecem em inglês**.
  Isso é decisão explícita do dono, para manter consistência com as APIs do NestJS/TypeORM
  (`findOne`, `@Injectable`, `Repository`) que não são traduzíveis.

## O que fazer

Percorrer os arquivos `.ts` em `src/` e adicionar comentários em PT-BR que separem o arquivo por
blocos funcionais, no formato:

```ts
// ---------------------------------------------
// Cadastro de usuário
// ---------------------------------------------
async register(dto: RegisterDto) { ... }

// ---------------------------------------------
// Login e emissão de sessão
// ---------------------------------------------
async login(dto: LoginDto) { ... }
```

Exemplos de blocos esperados por domínio: "Cadastro de usuário", "Verificação de email",
"Login e emissão de sessão", "Rotação de refresh token", "Recuperação de senha",
"Listagem de categorias", "Criação de produto", "Criação de pedido com baixa de estoque",
"Remoção com checagem de dependências". Adapte ao que cada arquivo realmente faz.

Além dos blocos, adicione comentário explicativo curto APENAS onde há decisão não óbvia
(lock pessimista, transação, proteção contra timing attack, cooldown, ordem de operações que
importa). O dono está aprendendo NestJS — o valor está em explicar o "porquê", não o "o quê".

## O que NÃO fazer (importante)

- **Não renomeie NADA.** Nenhuma variável, método, classe, propriedade, arquivo ou rota.
- **Não altere lógica, ordem de execução, tipos, imports ou assinaturas.** O diff deve conter
  exclusivamente linhas de comentário adicionadas.
- **Não comente o óbvio.** Nada de `// retorna o produto` acima de `return product;`.
  Comentário ruído é pior que nenhum comentário. Se uma linha se explica sozinha, deixe sem comentário.
- **Não adicione JSDoc/TSDoc em tudo.** Só onde agrega — o pedido é comentário de bloco navegável,
  não documentação formal de cada símbolo.
- **Não mexa nas mensagens de erro** — elas já estão corretas em PT-BR.
- Os 4 arquivos que já têm comentários em PT-BR (`auth.service.ts`, `orders.service.ts` e outros dois)
  já seguem o padrão: preserve o conteúdo existente, apenas acrescente os cabeçalhos de bloco se fizer sentido.

## Escopo

Todos os `.ts` sob `src/`, incluindo os `.spec.ts` (nesses, garanta que `describe`/`it` estejam em PT-BR —
a maioria já está). Ignore `node_modules`, `dist`, e arquivos gerados.

Sugestão de ordem, para revisar em partes: `src/modules/auth/` → `src/modules/users/` →
`src/modules/email/` → `src/modules/orders/` → `src/modules/products/` → `src/modules/categories/` →
`src/config/` → `src/db/`.

## Verificação obrigatória ao final

Rode e confirme que tudo passa:

```
npx tsc -p tsconfig.build.json --noEmit
npx jest
npm run format
```

Depois do `npm run format`, rode `tsc` e `jest` de novo (o Prettier reformata comentários longos e
pode quebrar linha de forma inesperada).

Como o diff deveria ser só de comentários, os testes precisam passar exatamente como passavam antes:
**14 suítes, 61 testes**. Se algum teste quebrar, você alterou comportamento sem querer — desfaça e reporte.

## Restrições de ambiente

- No PowerShell local pode ser necessário `npm.cmd` / `npx.cmd` por causa da Execution Policy.
- Não leia nem imprima o conteúdo do `.env` (contém segredos reais).
- Não rode migrations nem toque no banco.

## Entrega

Ao terminar, reporte:
1. Quantos arquivos foram alterados.
2. Confirmação de que nenhum identificador foi renomeado e nenhuma lógica mudou.
3. Saída de `tsc`, `jest` e `format`.
4. Qualquer arquivo onde você teve dúvida sobre como nomear o bloco funcional.
