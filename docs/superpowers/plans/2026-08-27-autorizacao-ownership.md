# Autorização e ownership — plano de implementação

> **Para executores agênticos:** SUB-SKILL OBRIGATÓRIA: usar superpowers:subagent-driven-development
> (recomendado) ou superpowers:executing-plans para implementar tarefa a tarefa. Os passos usam
> checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** proteger todas as rotas de negócio com autenticação, restringir a gestão de catálogo a
administradores e vincular cada pedido ao usuário que o criou.

**Arquitetura:** `JwtAuthGuard` vira guard global (`APP_GUARD`), protegendo tudo por padrão; rotas de
autenticação são liberadas com `@Public()`. Um `RolesGuard` roda em seguida, aplicando `@Roles()`.
`User` ganha a coluna `role`; `Order` ganha `userId`. A verificação de dono acontece na camada de
serviço, embutida na cláusula `where` da consulta — o que produz naturalmente 404 (e não 403) para
pedido de outro usuário.

**Stack:** NestJS 11, TypeScript, TypeORM 1.1.0, PostgreSQL (Supabase), class-validator, Jest.

**Spec:** `docs/superpowers/specs/2026-08-27-autorizacao-ownership-design.md`

## Restrições globais

- Comentários, mensagens de erro, docs e nomes de teste em **português brasileiro**; identificadores em inglês.
- Comentários organizados por bloco funcional, no formato já usado no projeto (`// ----` + título).
- `synchronize: false` sempre. Schema muda só por migration revisada antes de aplicar.
- Services injetam `Repository<Entity>` direto do TypeORM. Sem repositório customizado.
- `role` **nunca** é preenchido a partir de dados de request.
- Verificação de ownership sempre na camada de serviço, nunca só no controller.
- Pedido de outro usuário retorna **404**, nunca 403.
- Verificação a cada tarefa: `npx tsc -p tsconfig.build.json --noEmit`, `npx jest`, `npm run format`.
- Um commit ao final de cada tarefa, com os arquivos listados explicitamente (nunca `git add .`).

---

## Task 1: Coluna `role` no usuário

**Arquivos:**
- Modificar: `src/modules/users/entities/user.entity.ts`
- Modificar: `src/modules/users/users.service.ts`
- Modificar: `src/modules/users/users.service.spec.ts`
- Criar: `src/db/migrations/1787900000000-AddUserRole.ts`

**Interfaces:**
- Produz: `enum Role { ADMIN = 'ADMIN', CLIENTE = 'CLIENTE' }` exportado de
  `src/modules/users/entities/user.entity.ts` — consumido pelas Tasks 4, 5 e 7.
- Produz: `PublicUser` ganha o campo `role: Role` — consumido pelas Tasks 2, 4 e 7.

- [ ] **Passo 1: Escrever o teste que falha**

Em `src/modules/users/users.service.spec.ts`, adicionar dentro do `describe` existente:

```ts
it('expõe o papel do usuário no PublicUser', () => {
  const user = Object.assign(new User(), {
    id: '6f5c2c1e-9c4a-4c1a-9f1a-2b3c4d5e6f70',
    email: 'cliente@example.com',
    emailVerifiedAt: new Date('2026-08-27T10:00:00Z'),
    createdAt: new Date('2026-08-27T09:00:00Z'),
    role: Role.CLIENTE,
  });

  expect(service.toPublicUser(user)).toEqual({
    id: '6f5c2c1e-9c4a-4c1a-9f1a-2b3c4d5e6f70',
    email: 'cliente@example.com',
    isEmailVerified: true,
    createdAt: new Date('2026-08-27T09:00:00Z'),
    role: Role.CLIENTE,
  });
});
```

Acrescentar `Role` ao import existente de `./entities/user.entity`.

- [ ] **Passo 2: Rodar o teste e confirmar que falha**

Executar: `npx jest src/modules/users/users.service.spec.ts`
Esperado: FALHA — `toPublicUser` ainda não devolve `role`, e `Role` não existe.

- [ ] **Passo 3: Adicionar o enum e a coluna na entidade**

Em `src/modules/users/entities/user.entity.ts`, antes da classe `User`:

```ts
export enum Role {
  ADMIN = 'ADMIN',
  CLIENTE = 'CLIENTE',
}
```

Dentro da classe, logo após o bloco "Identidade e credencial", adicionar novo bloco:

```ts
  // ---------------------------------------------
  // Papel de acesso
  // ---------------------------------------------
  // Nunca preenchido a partir de dados de request: RegisterDto não declara o
  // campo e o ValidationPipe global rejeita propriedade não declarada.
  // Promoção a ADMIN acontece apenas via script de seed.
  @Column({ type: 'enum', enum: Role, default: Role.CLIENTE })
  role: Role;
```

- [ ] **Passo 4: Expor o papel no `PublicUser`**

Em `src/modules/users/users.service.ts`, adicionar `role: Role;` ao final da interface `PublicUser`,
importar `Role` de `./entities/user.entity`, e acrescentar `role: user.role,` ao objeto devolvido por
`toPublicUser`.

- [ ] **Passo 5: Rodar o teste e confirmar que passa**

Executar: `npx jest src/modules/users/users.service.spec.ts`
Esperado: PASSA.

- [ ] **Passo 6: Criar a migration**

Criar `src/db/migrations/1787900000000-AddUserRole.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserRole1787900000000 implements MigrationInterface {
  name = 'AddUserRole1787900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('ADMIN', 'CLIENTE')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "role" "public"."users_role_enum" NOT NULL DEFAULT 'CLIENTE'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
  }
}
```

- [ ] **Passo 7: Aplicar a migration e verificar**

Executar: `npm run migration:run`
Esperado: `AddUserRole1787900000000 has been executed successfully`.

Confirmar que os usuários existentes receberam o padrão (nenhum vira admin por acidente):

```bash
npx ts-node -e "import('./src/db/data-source').then(async (m)=>{const {DataSource}=require('typeorm');const ds=new DataSource({...m.dataSourceOptions,logging:false});await ds.initialize();console.log(await ds.query('SELECT role, COUNT(*)::int AS total FROM users GROUP BY role'));await ds.destroy();})"
```
Esperado: todos em `CLIENTE`.

- [ ] **Passo 8: Verificar tipos, formatar e commitar**

```bash
npm run format
npx tsc -p tsconfig.build.json --noEmit
npx jest
git add src/modules/users/entities/user.entity.ts src/modules/users/users.service.ts src/modules/users/users.service.spec.ts src/db/migrations/1787900000000-AddUserRole.ts
git commit -m "feat(users): adiciona papel de acesso ao usuário"
```

---

## Task 2: Decorators `@Public()` e `@CurrentUser()`

**Arquivos:**
- Criar: `src/decorators/public.decorator.ts`
- Criar: `src/decorators/current-user.decorator.ts`
- Remover: `src/decorators/.gitkeep` (a pasta agora tem conteúdo real)

**Interfaces:**
- Consome: `PublicUser` de `src/modules/users/users.service.ts` (Task 1).
- Produz: `IS_PUBLIC_KEY` (string) e `Public()` — consumidos pela Task 3.
- Produz: `CurrentUser()` param decorator que devolve `PublicUser` — consumido pela Task 7.

- [ ] **Passo 1: Criar o decorator `@Public()`**

Criar `src/decorators/public.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';

// ---------------------------------------------
// Marcação de rota pública
// ---------------------------------------------
// O guard de autenticação é global: tudo nasce protegido. Este decorator é a
// única forma de liberar uma rota, o que torna a exceção explícita e auditável.
export const IS_PUBLIC_KEY = 'isPublic';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

- [ ] **Passo 2: Criar o decorator `@CurrentUser()`**

Criar `src/decorators/current-user.decorator.ts`:

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PublicUser } from '../modules/users/users.service';

// ---------------------------------------------
// Usuário autenticado da requisição
// ---------------------------------------------
// O JwtStrategy grava o PublicUser em request.user após validar token e sessão.
// Só é seguro usar em rota protegida — em rota pública, request.user é undefined.
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PublicUser => {
    const request = context.switchToHttp().getRequest<{ user: PublicUser }>();
    return request.user;
  },
);
```

- [ ] **Passo 3: Remover o placeholder da pasta**

Executar: `rm src/decorators/.gitkeep` (ignorar se o arquivo não existir).

- [ ] **Passo 4: Verificar tipos, formatar e commitar**

```bash
npm run format
npx tsc -p tsconfig.build.json --noEmit
git add src/decorators/public.decorator.ts src/decorators/current-user.decorator.ts
git commit -m "feat(decorators): adiciona marcação de rota pública e usuário autenticado"
```

---

## Task 3: Guard de autenticação global

**Arquivos:**
- Modificar: `src/modules/auth/guards/jwt-auth.guard.ts`
- Modificar: `src/modules/auth/auth.controller.ts`
- Modificar: `src/app.controller.ts`
- Modificar: `src/app.module.ts`
- Criar: `src/modules/auth/guards/jwt-auth.guard.spec.ts`

**Interfaces:**
- Consome: `IS_PUBLIC_KEY`, `Public()` (Task 2).
- Produz: `JwtAuthGuard` registrado como `APP_GUARD` — a partir daqui, toda rota sem `@Public()` exige token.

- [ ] **Passo 1: Escrever o teste que falha**

Criar `src/modules/auth/guards/jwt-auth.guard.spec.ts`:

```ts
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const context = {
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;

  it('libera rota marcada como pública sem validar token', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    } as unknown as Reflector;

    expect(new JwtAuthGuard(reflector).canActivate(context)).toBe(true);
  });

  it('delega para a estratégia JWT quando a rota não é pública', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);
    const parent = jest
      .spyOn(
        Object.getPrototypeOf(Object.getPrototypeOf(guard)) as {
          canActivate: () => boolean;
        },
        'canActivate',
      )
      .mockReturnValue(true);

    expect(guard.canActivate(context)).toBe(true);
    expect(parent).toHaveBeenCalledWith(context);
    parent.mockRestore();
  });
});
```

- [ ] **Passo 2: Rodar o teste e confirmar que falha**

Executar: `npx jest src/modules/auth/guards/jwt-auth.guard.spec.ts`
Esperado: FALHA — o construtor atual do `JwtAuthGuard` não aceita `Reflector`.

- [ ] **Passo 3: Fazer o guard respeitar `@Public()`**

Substituir `src/modules/auth/guards/jwt-auth.guard.ts` por:

```ts
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../../../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  // ---------------------------------------------
  // Liberação de rotas públicas
  // ---------------------------------------------
  // Sem @Public(), a rota exige token. Um controller novo que esqueça a
  // anotação nasce protegido — falha fechada, ao contrário de guard por
  // controller, que deixaria a rota aberta silenciosamente.
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }
}
```

- [ ] **Passo 4: Marcar as rotas públicas de autenticação**

Em `src/modules/auth/auth.controller.ts`, importar `Public` de `../../decorators/public.decorator` e
adicionar `@Public()` acima de cada um destes handlers: `register`, `verifyEmail`,
`resendVerification`, `login`, `refresh`, `logout`, `forgotPassword`, `resetPassword`.

**Não** marcar `me` — essa rota exige autenticação.

Remover a linha `@UseGuards(JwtAuthGuard)` de `me`: o guard agora é global e a anotação vira redundante.
Manter os `@UseGuards(OriginGuard)` existentes.

- [ ] **Passo 5: Marcar a rota de health como pública**

Em `src/app.controller.ts`, importar `Public` de `./decorators/public.decorator` e adicionar `@Public()`
acima do handler `getHello`.

- [ ] **Passo 6: Registrar o guard globalmente**

Em `src/app.module.ts`, importar `JwtAuthGuard` de
`./modules/auth/guards/jwt-auth.guard` e adicionar ao array `providers`, **antes** do
`ThrottlerGuard` já existente:

```ts
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
```

- [ ] **Passo 7: Rodar os testes**

Executar: `npx jest`
Esperado: todas as suítes passam, incluindo a nova.

- [ ] **Passo 8: Testar manualmente que a proteção pegou**

Subir o servidor (`npm run start:dev`) e confirmar:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/products
# esperado: 401

curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" -d '{"email":"x@example.com","password":"errada"}'
# esperado: 401 (rota pública funcionando — a falha é de credencial, não de guard)

curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
# esperado: 200
```

Se `/auth/login` devolver 401 sem sequer processar o corpo, ou `/` devolver 401, alguma rota pública
ficou sem `@Public()`.

- [ ] **Passo 9: Formatar e commitar**

```bash
npm run format
npx tsc -p tsconfig.build.json --noEmit
git add src/modules/auth/guards/jwt-auth.guard.ts src/modules/auth/guards/jwt-auth.guard.spec.ts src/modules/auth/auth.controller.ts src/app.controller.ts src/app.module.ts
git commit -m "feat(auth): torna o guard de autenticação global com exceções explícitas"
```

---

## Task 4: Guard de papéis

**Arquivos:**
- Criar: `src/decorators/roles.decorator.ts`
- Criar: `src/modules/auth/guards/roles.guard.ts`
- Criar: `src/modules/auth/guards/roles.guard.spec.ts`
- Modificar: `src/app.module.ts`

**Interfaces:**
- Consome: `Role` (Task 1), `PublicUser` (Task 1).
- Produz: `ROLES_KEY`, `Roles(...roles: Role[])` e `RolesGuard` — consumidos pela Task 5.

- [ ] **Passo 1: Escrever o teste que falha**

Criar `src/modules/auth/guards/roles.guard.spec.ts`:

```ts
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../users/entities/user.entity';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const contextComUsuario = (role?: Role) =>
    ({
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({
        getRequest: () => (role ? { user: { role } } : {}),
      }),
    }) as unknown as ExecutionContext;

  const reflectorCom = (roles: Role[] | undefined) =>
    ({
      getAllAndOverride: jest.fn().mockReturnValue(roles),
    }) as unknown as Reflector;

  it('libera rota sem exigência de papel', () => {
    const guard = new RolesGuard(reflectorCom(undefined));
    expect(guard.canActivate(contextComUsuario(Role.CLIENTE))).toBe(true);
  });

  it('libera quando o usuário tem o papel exigido', () => {
    const guard = new RolesGuard(reflectorCom([Role.ADMIN]));
    expect(guard.canActivate(contextComUsuario(Role.ADMIN))).toBe(true);
  });

  it('recusa quando o papel do usuário não basta', () => {
    const guard = new RolesGuard(reflectorCom([Role.ADMIN]));
    expect(() => guard.canActivate(contextComUsuario(Role.CLIENTE))).toThrow(
      ForbiddenException,
    );
  });

  it('recusa quando não há usuário na requisição', () => {
    const guard = new RolesGuard(reflectorCom([Role.ADMIN]));
    expect(() => guard.canActivate(contextComUsuario())).toThrow(
      ForbiddenException,
    );
  });
});
```

- [ ] **Passo 2: Rodar o teste e confirmar que falha**

Executar: `npx jest src/modules/auth/guards/roles.guard.spec.ts`
Esperado: FALHA — `roles.guard.ts` não existe.

- [ ] **Passo 3: Criar o decorator `@Roles()`**

Criar `src/decorators/roles.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';
import { Role } from '../modules/users/entities/user.entity';

// ---------------------------------------------
// Exigência de papel na rota
// ---------------------------------------------
export const ROLES_KEY = 'roles';

export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
```

- [ ] **Passo 4: Criar o `RolesGuard`**

Criar `src/modules/auth/guards/roles.guard.ts`:

```ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../../decorators/roles.decorator';
import { Role } from '../../users/entities/user.entity';
import { PublicUser } from '../../users/users.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  // ---------------------------------------------
  // Verificação do papel exigido
  // ---------------------------------------------
  // Roda depois do guard de autenticação, então request.user já existe em rota
  // protegida. Sem @Roles() a rota passa: papel só é cobrado quando declarado.
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: PublicUser }>();
    if (!request.user || !required.includes(request.user.role)) {
      throw new ForbiddenException(
        'Acesso restrito a administradores.',
      );
    }
    return true;
  }
}
```

- [ ] **Passo 5: Registrar o guard globalmente**

Em `src/app.module.ts`, importar `RolesGuard` de `./modules/auth/guards/roles.guard` e adicionar ao
array `providers`, **logo depois** do `JwtAuthGuard` da Task 3:

```ts
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
```

A ordem importa: guards `APP_GUARD` executam na ordem de registro, e `RolesGuard` depende de
`request.user` já preenchido pelo `JwtAuthGuard`.

- [ ] **Passo 6: Rodar o teste e confirmar que passa**

Executar: `npx jest src/modules/auth/guards/roles.guard.spec.ts`
Esperado: PASSA, 4 testes.

- [ ] **Passo 7: Formatar e commitar**

```bash
npm run format
npx tsc -p tsconfig.build.json --noEmit
git add src/decorators/roles.decorator.ts src/modules/auth/guards/roles.guard.ts src/modules/auth/guards/roles.guard.spec.ts src/app.module.ts
git commit -m "feat(auth): adiciona guard de papéis para rotas restritas"
```

---

## Task 5: Restringir a gestão de catálogo a administradores

**Arquivos:**
- Modificar: `src/modules/products/products.controller.ts`
- Modificar: `src/modules/categories/categories.controller.ts`

**Interfaces:**
- Consome: `Roles()` e `Role` (Tasks 1 e 4).
- Produz: escrita de catálogo exigindo `ADMIN`; leitura permanece para qualquer autenticado.

- [ ] **Passo 1: Restringir escrita em produtos**

Em `src/modules/products/products.controller.ts`, importar:

```ts
import { Roles } from '../../decorators/roles.decorator';
import { Role } from '../users/entities/user.entity';
```

Adicionar `@Roles(Role.ADMIN)` acima dos handlers `create`, `update` e `remove`. **Não** adicionar em
`findAll` nem `findOne` — leitura é liberada para qualquer usuário autenticado.

Acrescentar acima da classe o comentário de bloco:

```ts
// ---------------------------------------------
// Catálogo de produtos
// ---------------------------------------------
// Leitura liberada a qualquer usuário autenticado; escrita restrita a ADMIN.
```

- [ ] **Passo 2: Restringir escrita em categorias**

Em `src/modules/categories/categories.controller.ts`, aplicar os mesmos imports e adicionar
`@Roles(Role.ADMIN)` acima de `create` e `remove`. Não adicionar em `findAll` nem `findOne`.

Acrescentar acima da classe:

```ts
// ---------------------------------------------
// Catálogo de categorias
// ---------------------------------------------
// Leitura liberada a qualquer usuário autenticado; escrita restrita a ADMIN.
```

- [ ] **Passo 3: Verificar tipos e testes**

```bash
npx tsc -p tsconfig.build.json --noEmit
npx jest
```
Esperado: sem erros, todas as suítes passam.

- [ ] **Passo 4: Formatar e commitar**

```bash
npm run format
git add src/modules/products/products.controller.ts src/modules/categories/categories.controller.ts
git commit -m "feat(catalogo): restringe escrita de produtos e categorias a administradores"
```

---

## Task 6: Dono do pedido no schema

**Arquivos:**
- Modificar: `src/modules/orders/entities/order.entity.ts`
- Criar: `src/db/migrations/1787900000001-AddOrderOwner.ts`

**Interfaces:**
- Consome: `User` (entidade), `Role` (Task 1).
- Produz: `Order.userId: string` e relação `Order.user: User` — consumidos pela Task 7.

> **Atenção — passo destrutivo.** A migration apaga todos os registros de `order_items` e `orders`.
> São dados gerados pelas auditorias do projeto, sem valor real, mas a operação é irreversível.
> Confirmar com o proprietário antes de executar o Passo 3.

- [ ] **Passo 1: Adicionar a relação na entidade**

Em `src/modules/orders/entities/order.entity.ts`, importar `JoinColumn`, `ManyToOne` e `Index` de
`typeorm`, e `User` de `../../users/entities/user.entity`. Adicionar dentro da classe `Order`:

```ts
  // ---------------------------------------------
  // Dono do pedido
  // ---------------------------------------------
  // Índice obrigatório: toda listagem de pedido de cliente filtra por userId.
  @Index('IDX_orders_user')
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;
```

- [ ] **Passo 2: Criar a migration**

Criar `src/db/migrations/1787900000001-AddOrderOwner.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderOwner1787900000001 implements MigrationInterface {
  name = 'AddOrderOwner1787900000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Os pedidos existentes são dados de teste sem dono. Como userId é NOT NULL,
    // precisam sair antes da coluna entrar. Itens primeiro, por causa da FK.
    await queryRunner.query(`DELETE FROM "order_items"`);
    await queryRunner.query(`DELETE FROM "orders"`);

    await queryRunner.query(`ALTER TABLE "orders" ADD "userId" uuid NOT NULL`);
    await queryRunner.query(
      `CREATE INDEX "IDX_orders_user" ON "orders" ("userId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_user"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_orders_user"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "userId"`);
  }
}
```

- [ ] **Passo 3: Aplicar a migration (requer confirmação do proprietário)**

Executar: `npm run migration:run`
Esperado: `AddOrderOwner1787900000001 has been executed successfully`.

- [ ] **Passo 4: Verificar o schema no banco**

```bash
npx ts-node -e "import('./src/db/data-source').then(async (m)=>{const {DataSource}=require('typeorm');const ds=new DataSource({...m.dataSourceOptions,logging:false});await ds.initialize();console.log(await ds.query(\"SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='orders' ORDER BY column_name\"));console.log(await ds.query('SELECT COUNT(*)::int AS pedidos FROM orders'));await ds.destroy();})"
```
Esperado: coluna `userId` presente com `is_nullable = NO`, e zero pedidos.

- [ ] **Passo 5: Verificar tipos, formatar e commitar**

```bash
npm run format
npx tsc -p tsconfig.build.json --noEmit
git add src/modules/orders/entities/order.entity.ts src/db/migrations/1787900000001-AddOrderOwner.ts
git commit -m "feat(pedidos): vincula pedido ao usuário que o criou"
```

---

## Task 7: Ownership nos pedidos

**Arquivos:**
- Modificar: `src/modules/orders/orders.service.ts`
- Modificar: `src/modules/orders/orders.controller.ts`
- Criar: `src/modules/orders/orders.service.spec.ts`

**Interfaces:**
- Consome: `Order.userId` (Task 6), `PublicUser` e `Role` (Task 1), `CurrentUser()` (Task 2).
- Produz: `OrdersService.create(dto, user)`, `findAll(user)`, `findOne(id, user)` — todos recebendo
  `PublicUser` como último parâmetro.

- [ ] **Passo 1: Escrever os testes que falham**

Criar `src/modules/orders/orders.service.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Role } from '../users/entities/user.entity';
import { PublicUser } from '../users/users.service';
import { Order } from './entities/order.entity';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  const cliente: PublicUser = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'cliente@example.com',
    isEmailVerified: true,
    createdAt: new Date('2026-08-27T09:00:00Z'),
    role: Role.CLIENTE,
  };
  const admin: PublicUser = { ...cliente, id: '22222222-2222-4222-8222-222222222222', role: Role.ADMIN };

  let repository: { find: jest.Mock; findOne: jest.Mock };
  let service: OrdersService;

  beforeEach(() => {
    repository = { find: jest.fn(), findOne: jest.fn() };
    service = new OrdersService(repository as unknown as Repository<Order>);
  });

  it('lista apenas os pedidos do próprio cliente', async () => {
    repository.find.mockResolvedValue([]);
    await service.findAll(cliente);
    expect(repository.find).toHaveBeenCalledWith({
      where: { userId: cliente.id },
      relations: { items: true },
    });
  });

  it('lista todos os pedidos para administrador', async () => {
    repository.find.mockResolvedValue([]);
    await service.findAll(admin);
    expect(repository.find).toHaveBeenCalledWith({
      where: {},
      relations: { items: true },
    });
  });

  it('restringe a consulta por id ao dono quando é cliente', async () => {
    repository.findOne.mockResolvedValue(Object.assign(new Order(), { id: 7 }));
    await service.findOne(7, cliente);
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 7, userId: cliente.id },
      relations: { items: true },
    });
  });

  it('devolve 404 (e não 403) para pedido de outro usuário', async () => {
    // A consulta já filtra por dono, então pedido alheio simplesmente não é
    // encontrado. Um 403 confirmaria que o pedido existe e permitiria enumerar.
    repository.findOne.mockResolvedValue(null);
    await expect(service.findOne(7, cliente)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
```

- [ ] **Passo 2: Rodar os testes e confirmar que falham**

Executar: `npx jest src/modules/orders/orders.service.spec.ts`
Esperado: FALHA — os métodos ainda não aceitam o parâmetro de usuário.

- [ ] **Passo 3: Aplicar ownership no serviço**

Em `src/modules/orders/orders.service.ts`, importar `Role` de `../users/entities/user.entity` e
`PublicUser` de `../users/users.service`. Substituir `findAll` e `findOne` por:

```ts
  // ---------------------------------------------
  // Listagem de pedidos
  // ---------------------------------------------
  // Administrador enxerga todos; cliente enxerga apenas os próprios.
  findAll(user: PublicUser): Promise<Order[]> {
    return this.ordersRepository.find({
      where: user.role === Role.ADMIN ? {} : { userId: user.id },
      relations: { items: true },
    });
  }

  // ---------------------------------------------
  // Consulta de pedido por identificador
  // ---------------------------------------------
  // O filtro de dono entra na própria consulta: pedido alheio não é encontrado
  // e resulta em 404. Um 403 revelaria que o pedido existe.
  async findOne(id: number, user: PublicUser): Promise<Order> {
    const order = await this.ordersRepository.findOne({
      where: user.role === Role.ADMIN ? { id } : { id, userId: user.id },
      relations: { items: true },
    });
    if (!order) {
      throw new NotFoundException(`Pedido ${id} não encontrado`);
    }
    return order;
  }
```

Na assinatura de `create`, acrescentar o parâmetro `user: PublicUser`, e ao criar o pedido incluir o
dono — trocar `manager.create(Order, { total, items })` por
`manager.create(Order, { total, items, userId: user.id })`.

- [ ] **Passo 4: Repassar o usuário no controller**

Em `src/modules/orders/orders.controller.ts`, importar:

```ts
import { CurrentUser } from '../../decorators/current-user.decorator';
import { PublicUser } from '../users/users.service';
```

Adicionar `@CurrentUser() user: PublicUser` como último parâmetro de `findAll`, `findOne` e `create`,
repassando `user` para o método correspondente do serviço.

- [ ] **Passo 5: Rodar os testes e confirmar que passam**

Executar: `npx jest`
Esperado: todas as suítes passam, incluindo os 4 testes novos.

- [ ] **Passo 6: Formatar e commitar**

```bash
npm run format
npx tsc -p tsconfig.build.json --noEmit
git add src/modules/orders/orders.service.ts src/modules/orders/orders.controller.ts src/modules/orders/orders.service.spec.ts
git commit -m "feat(pedidos): restringe pedidos ao próprio usuário"
```

---

## Task 8: Script de promoção a administrador

**Arquivos:**
- Criar: `scripts/seed-admin.ts`
- Modificar: `package.json`

**Interfaces:**
- Consome: `dataSourceOptions` (`src/db/data-source.ts`), `Role` e `User` (Task 1).
- Produz: comando `npm run seed:admin -- <email>`.

- [ ] **Passo 1: Criar o script**

Criar `scripts/seed-admin.ts`:

```ts
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/db/data-source';
import { Role, User } from '../src/modules/users/entities/user.entity';

// ---------------------------------------------
// Promoção de usuário a administrador
// ---------------------------------------------
// Único caminho para criar um ADMIN: a API nunca aceita papel vindo de request.
// Exige que o usuário já exista, criado pelo fluxo normal de cadastro.
async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    throw new Error('Informe o email: npm run seed:admin -- usuario@example.com');
  }

  const dataSource = new DataSource({ ...dataSourceOptions, logging: false });
  await dataSource.initialize();
  try {
    const repository = dataSource.getRepository(User);
    const user = await repository.findOneBy({ email });
    if (!user) {
      throw new Error(`Usuário ${email} não encontrado. Cadastre-o primeiro.`);
    }

    user.role = Role.ADMIN;
    await repository.save(user);
    console.log(`Usuário ${email} promovido a ADMIN.`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
```

- [ ] **Passo 2: Adicionar o script ao `package.json`**

Dentro de `"scripts"`, acrescentar:

```json
"seed:admin": "ts-node -r tsconfig-paths/register scripts/seed-admin.ts"
```

- [ ] **Passo 3: Testar o caminho de erro**

Executar: `npm run seed:admin -- nao-existe@example.com`
Esperado: sai com erro `Usuário nao-existe@example.com não encontrado. Cadastre-o primeiro.` e código 1.

- [ ] **Passo 4: Promover um usuário real e verificar**

Escolher um email já cadastrado (ou cadastrar um via `POST /auth/register`), então:

```bash
npm run seed:admin -- <email-existente>
```
Esperado: `Usuário <email> promovido a ADMIN.`

Confirmar no banco:

```bash
npx ts-node -e "import('./src/db/data-source').then(async (m)=>{const {DataSource}=require('typeorm');const ds=new DataSource({...m.dataSourceOptions,logging:false});await ds.initialize();console.log(await ds.query('SELECT email, role FROM users ORDER BY role'));await ds.destroy();})"
```

- [ ] **Passo 5: Verificar tipos, formatar e commitar**

```bash
npm run format
npx tsc -p tsconfig.build.json --noEmit
git add scripts/seed-admin.ts package.json
git commit -m "feat(scripts): adiciona promoção de usuário a administrador"
```

---

## Task 9: Verificação manual ponta a ponta

**Arquivos:** nenhum (validação).

**Interfaces:**
- Consome: tudo das Tasks 1 a 8.

- [ ] **Passo 1: Preparar dois usuários**

Com o servidor no ar, cadastrar e verificar dois usuários pelo fluxo normal (obter o token de
verificação em `auth_action_tokens`, já que o envio de email depende do Resend). Promover apenas um:

```bash
npm run seed:admin -- <email-do-admin>
```

- [ ] **Passo 2: Confirmar que papel não é aceito no cadastro**

```bash
curl -s -w "\nstatus=%{http_code}\n" -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"tentativa@example.com","password":"frase-senha-bem-longa-de-teste","role":"ADMIN"}'
```
Esperado: `400`, com mensagem indicando que a propriedade `role` não é permitida.

- [ ] **Passo 3: Confirmar que cliente não gerencia catálogo**

Fazer login como cliente, guardar o access token, então:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/products \
  -H "Authorization: Bearer <token-cliente>" -H "Content-Type: application/json" \
  -d '{"name":"Teste","price":10,"categoryId":1,"stock":5}'
# esperado: 403

curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/products \
  -H "Authorization: Bearer <token-cliente>"
# esperado: 200 (leitura é liberada)
```

- [ ] **Passo 4: Confirmar que admin gerencia catálogo**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/categories \
  -H "Authorization: Bearer <token-admin>" -H "Content-Type: application/json" \
  -d '{"name":"Categoria Admin"}'
# esperado: 201
```

- [ ] **Passo 5: Confirmar ownership de pedido**

Criar um pedido como cliente e anotar o id. Então, logado como um **segundo cliente**:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/orders/<id-do-pedido-alheio> \
  -H "Authorization: Bearer <token-segundo-cliente>"
# esperado: 404 (NÃO 403)

curl -s http://localhost:3000/orders -H "Authorization: Bearer <token-segundo-cliente>"
# esperado: [] — não enxerga o pedido do outro
```

E como admin:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/orders/<id-do-pedido-alheio> \
  -H "Authorization: Bearer <token-admin>"
# esperado: 200
```

- [ ] **Passo 6: Registrar o resultado**

Se algum passo divergir do esperado, abrir como achado antes de considerar o subprojeto concluído.
Nenhum commit neste passo — é validação.
