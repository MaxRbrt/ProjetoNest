# ADR-001: Implementar autenticação JWT manual com sessões revogáveis

## Status

Aceito — desenho revisado e implementação autorizada pelo responsável do projeto.

## Data

2026-08-26

## Contexto

O projeto é uma API de aprendizado em NestJS com Postgres hospedado no
Supabase. A persistência já existe, mas nenhuma rota possui identidade. O
objetivo do subprojeto 3 é aprender o mecanismo de autenticação por dentro sem
terceirizar cadastro, senha e sessão para o Supabase Auth.

Ao mesmo tempo, o fluxo deve ser adequado como base de uma aplicação pública:
email verificado, senhas modernas, tokens curtos, refresh rotativo, logout real,
recuperação segura, throttling e resistência a enumeração.

## Decisão

Implementar no NestJS:

- `UsersModule`, `AuthModule` e `EmailModule` separados;
- senhas com Argon2id e consulta k-anônima ao Pwned Passwords;
- access token JWT HS256 de 15 minutos;
- sessão persistida, identificada pelo claim `sid`;
- refresh token opaco rotativo, persistido somente como SHA-256;
- tokens opacos de uso único para verificação e recuperação;
- email pelo Resend;
- testes automatizados unitários, de integração e E2E para autenticação.

## Alternativas consideradas

### Supabase Auth

Reduz código e operação, mas remove o principal objetivo pedagógico. Rejeitado.

### JWT stateless sem sessão no banco

Elimina uma consulta por request, porém logout e reset não invalidam access
tokens imediatamente. Rejeitado devido à prioridade de segurança.

### Sessão tradicional sem JWT

Seria válida para um frontend web, mas não ensina o mecanismo JWT escolhido
para o roadmap. Rejeitada.

### Outbox de email nesta versão

Traz retry confiável, mas exige worker e estado adicional. Adiada até existir
necessidade operacional comprovada.

## Consequências

- Cada requisição protegida valida JWT, usuário e sessão ativa.
- Logout, reset e reuse detection revogam access e refresh imediatamente.
- O banco ganha quatro tabelas de autenticação e índices associados.
- HIBP e Resend tornam-se dependências externas com timeout e falha fechada ou
  recuperação explícita.
- A autenticação terá testes automatizados, exceção consciente à convenção
  anterior do projeto.
- O subprojeto 4 continua obrigatório antes da exposição pública das rotas de
  negócio.

## Referência

`docs/superpowers/specs/2026-08-26-autenticacao-jwt-design.md`
