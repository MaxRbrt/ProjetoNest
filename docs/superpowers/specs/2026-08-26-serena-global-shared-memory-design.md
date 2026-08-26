# Serena Global com Memória Compartilhada entre Claude e Codex

## Objetivo

Disponibilizar a Serena em todos os projetos locais usados pelo Claude Code e pelo Codex, mantendo a memória técnica isolada por projeto. No mesmo diretório de projeto, os dois agentes devem ler e escrever a mesma pasta `.serena/memories`.

## Estado atual

- Serena CLI instalada e disponível no `PATH`.
- Serena MCP ativa nesta sessão do Codex, com projeto `projeto-test` e LSP TypeScript funcionais.
- Serena não registrada no Claude Code.
- Codex CLI sem servidor MCP Serena registrado.
- `.serena/memories` existe, mas está vazia; onboarding do projeto incompleto.
- `.serena` já está ignorada pelo Git e deve continuar local.

## Decisões

### Disponibilidade global, memória por projeto

Serena será registrada globalmente nos dois clientes. O servidor deverá detectar o projeto a partir do diretório de trabalho, usando o projeto Serena ou repositório Git ancestral mais próximo.

Memórias de arquitetura, comandos e convenções permanecerão na pasta `.serena/memories` da raiz de cada projeto. Isso permite que Claude e Codex compartilhem contexto quando trabalham na mesma pasta, sem contaminar projetos diferentes.

O namespace `global/` ficará reservado a preferências universais explicitamente aprovadas pelo usuário. Nenhuma informação específica de `projeto-test` será gravada como memória global.

### Registro dos clientes

- Usar o instalador nativo da Serena para registrar o MCP no Claude Code e no Codex CLI.
- Verificar o resultado com os comandos de listagem/saúde dos próprios clientes.
- Não copiar credenciais nem inserir segredos em arquivos do projeto.
- Não iniciar uma nova tarefa do Claude durante a configuração; a validação inicial limita-se à saúde do MCP e à memória compartilhada em disco.

### Onboarding do projeto atual

Criar as memórias duráveis exigidas pela Serena:

- `core`
- `tech_stack`
- `suggested_commands`
- `conventions`
- `task_completion`

O conteúdo será derivado apenas de arquivos estáveis do repositório. Planos em andamento, IDs de sessões, tokens, URLs privadas e valores de `.env` não entrarão na memória.

## Fluxo

1. Claude ou Codex inicia dentro de um repositório.
2. Serena identifica o projeto pelo diretório atual.
3. Serena carrega a configuração local de `.serena`.
4. O agente lista as memórias do projeto e lê somente as relevantes.
5. Atualizações estáveis são escritas na mesma `.serena/memories`, ficando disponíveis ao outro agente na próxima leitura.

## Concorrência e falhas

- Claude e Codex não devem editar a mesma memória simultaneamente.
- O handoff com confirmação humana continua sendo a barreira para troca de agente.
- Falha ao iniciar Serena não deve apagar nem recriar memórias automaticamente.
- Se um cliente não conectar, preservar a configuração existente e diagnosticar pelo comando de saúde antes de alterar o registro.
- Memória ausente significa contexto não inicializado, não autorização para inferir ou inventar conteúdo.

## Validação

1. Confirmar Serena saudável no Claude Code e no Codex CLI.
2. Concluir o onboarding e listar as cinco memórias obrigatórias.
3. Criar uma memória temporária de teste no projeto.
4. Ler a memória pela interface Serena usada pelo Codex e pela CLI compartilhada.
5. Confirmar que o Claude aponta para a mesma instância/configuração do projeto sem iniciar trabalho concorrente.
6. Remover a memória temporária.
7. Executar `serena memories check` e exigir ausência de referências obsoletas.
8. Confirmar via Git que `.serena` e seus conteúdos não serão versionados.

Uma validação end-to-end que peça ao modelo Claude para ler a memória poderá ser executada depois que o handoff atual terminar e houver cota disponível. A saúde do MCP e a leitura pela mesma CLI são suficientes para a configuração inicial sem consumir uma nova sessão do modelo.

## Critérios de aceite

- Serena aparece conectada no Claude Code e no Codex CLI em qualquer repositório local.
- `projeto-test` é ativado automaticamente quando o cliente inicia nesta pasta.
- As cinco memórias de onboarding existem e passam na verificação de referências.
- Claude e Codex usam a mesma pasta de memória para este projeto.
- Nenhuma memória de projeto é gravada no namespace global.
- Nenhum arquivo `.serena`, cache, segredo ou memória é adicionado ao Git.
