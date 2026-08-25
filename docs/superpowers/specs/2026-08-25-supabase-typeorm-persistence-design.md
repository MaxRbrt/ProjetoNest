# Persistência real com Supabase (Postgres) + TypeORM

**Data:** 2026-08-25
**Sub-projeto:** 2 de 5 (Validação → **Persistência** → JWT → Autorização → Frontend)

## Contexto

O backend (`categories`, `products`, `orders`) hoje guarda dados em arrays em memória, dentro de cada `*.service.ts`. Dados somem a cada restart do processo. Este sub-projeto troca essa camada por Postgres real, hospedado no Supabase, acessado via TypeORM.

## Objetivo

- Dados sobrevivem a restart do servidor
- Schema do banco versionado (migrations), não gerado magicamente
- Base pronta pra sub-projeto 3 (tabela `users` pra autenticação JWT)

## Fora de escopo

- Autenticação/autorização (sub-projetos 3 e 4)
- Índices/otimizações de performance além do básico (chaves primárias/estrangeiras)
- Pool de conexão avançado, read replicas, cache — não cabe no estágio atual do projeto

## Decisões de arquitetura

### ORM: TypeORM
Integração oficial do Nest (`@nestjs/typeorm`), entidades com decorators — consistente com o estilo já usado em DTOs/entities do projeto. Prisma foi considerado e descartado por não ter módulo oficial Nest e introduzir uma sintaxe (`schema.prisma`) fora do que o curso ensina.

### Estratégia de schema: Migrations (não `synchronize`)
`synchronize: true` deixaria o TypeORM alterar tabelas automaticamente a cada boot — rápido para prototipar, mas arriscado (pode dropar coluna/dado sem aviso) e não é como projetos reais operam. Migrations ficam versionadas em `src/db/migrations/`, geradas a partir do diff entre entities e banco, revisadas antes de aplicar.

### Repository pattern: direto, sem abstração customizada
Cada service injeta `Repository<Entity>` do próprio TypeORM (`@InjectRepository`) em vez de uma interface própria de repositório. Decisão consistente com a simplicidade já escolhida no design original do backend (ver histórico do projeto) — o Nest+TypeORM já oferece a troca de implementação que uma abstração customizada daria, sem código extra.

### Segredos: `.env`, nunca no código ou na conversa
`DATABASE_URL` fica em `.env` (já coberto pelo `.gitignore` existente). Um `.env.example` documenta a variável esperada, sem valor real. A connection string não é compartilhada em chat, commit, ou log.

## Entidades e relacionamentos

```
Category (1) ──< (N) Product (1) ──< (N) OrderItem >── (N) Order (1)
```

- **Category**: `id` (PK, gerado), `name`
- **Product**: `id` (PK, gerado), `name`, `price`, `stock`, `categoryId` (FK → Category)
- **Order**: `id` (PK, gerado), `total`, `createdAt`
- **OrderItem** (nova tabela — hoje é só uma interface embutida em `order.entity.ts`): `id` (PK, gerado), `orderId` (FK → Order), `productId` (FK → Product), `quantity`

`OrderItem` é a tabela de junção entre `Order` e `Product` (relação N-N modelada explicitamente, com o campo extra `quantity`).

## Configuração

- `src/db/data-source.ts`: `DataSource` do TypeORM, lê `DATABASE_URL` do `.env`, `synchronize: false`, `migrations: ['src/db/migrations/*.ts']`
- `ConfigModule` (`@nestjs/config`) global no `AppModule`, pra ler env vars de forma tipada em vez de `process.env` espalhado
- `TypeOrmModule.forRootAsync` no `AppModule`, usando a config acima
- Cada módulo de domínio (`CategoriesModule`, `ProductsModule`, `OrdersModule`) registra suas entidades via `TypeOrmModule.forFeature([...])`

## Mudança nos services

Cada `*.service.ts` troca:
```ts
private categories: Category[] = [];
```
por:
```ts
constructor(
  @InjectRepository(Category) private readonly repo: Repository<Category>,
) {}
```
E os métodos (`findAll`, `findOne`, `create`, `update`, `remove`) passam a chamar `repo.find()`, `repo.findOneBy()`, `repo.save()`, `repo.delete()` em vez de manipular array. `OrdersService.create` passa a persistir `Order` + seus `OrderItem` (transação simples via `repo.manager` ou save em cascata).

## Fluxo de migrations

1. Editar/criar entity (`@Entity`, `@Column`, `@ManyToOne`, etc.)
2. `npm run migration:generate -- src/db/migrations/NomeDaMudanca` — TypeORM compara entities com o schema atual do banco e gera o SQL da diferença
3. Revisar o arquivo gerado (garantir que faz sentido)
4. `npm run migration:run` — aplica no Supabase
5. `npm run migration:revert` — desfaz a última, se necessário

## Testes

Reaproveita o fluxo manual já em uso (Thunder Client / navegador / curl): criar categoria → produto → pedido, reiniciar o servidor, confirmar que os dados continuam lá (prova que saiu da memória pro banco).

## Riscos e mitigação

- **Connection string exposta**: mitigado por `.gitignore` já cobrir `.env`, e por nunca solicitar o valor em chat
- **Migration gerada errada**: mitigado por revisão manual do SQL antes de rodar `migration:run`
- **Quebra dos endpoints existentes durante a troca**: mitigado fazendo módulo por módulo (`categories` primeiro, testado, depois `products`, depois `orders`) em vez de trocar tudo de uma vez
