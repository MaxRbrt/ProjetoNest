# Persistência TypeORM + Supabase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar os arrays em memória de `categories`, `products` e `orders` por persistência real em Postgres (Supabase), via TypeORM, com migrations versionadas.

**Architecture:** Cada módulo de domínio registra sua(s) entidade(s) via `TypeOrmModule.forFeature`, e cada `*.service.ts` troca o array privado por um `Repository<Entity>` injetado. `Product` referencia `Category` (FK). `OrderItem` vira tabela própria, ligando `Order` e `Product` (N-N com campo extra `quantity`). `OrdersService.create` roda dentro de uma transação (`EntityManager.transaction`) para garantir atomicidade entre checar/abater estoque e gravar o pedido — se qualquer item falhar no meio do loop, tudo é revertido (isso é uma decisão além do que a spec descreveu literalmente, mas resolve uma falha real de atomicidade que a versão ingênua teria).

**Tech Stack:** NestJS 11, TypeORM 0.3.x, `pg` (driver Postgres), `@nestjs/config`, `dotenv`, Supabase Postgres.

**Spec:** `docs/superpowers/specs/2026-08-25-supabase-typeorm-persistence-design.md`

## Global Constraints

- `DATABASE_URL` vem de `.env` (nunca hardcoded, nunca commitado — já coberto pelo `.gitignore` existente)
- `synchronize: false` sempre — schema muda só via migration
- Sem abstração de repositório customizada — services injetam `Repository<Entity>` do próprio TypeORM diretamente
- **Adaptação ao padrão do projeto:** este projeto não tem suite de testes automatizados (nenhum `*.spec.ts` de negócio existe, todo o backend até aqui foi validado manualmente via navegador/Thunder Client/curl, mais `tsc --noEmit` e `npm run format` como verificação de tipo/estilo). Os passos de verificação de cada task seguem esse padrão já estabelecido — `tsc --noEmit` + teste manual de endpoint — em vez de testes Jest, que não fazem parte da convenção atual do projeto.
- Pré-requisito antes da Task 1: você já deve ter criado `.env` na raiz com `DATABASE_URL=<connection string do Supabase>` (Settings → Database → Connection string, modo URI, no painel do Supabase). Sem isso, a Task 1 falha no passo de verificação.

---

## Task 1: Dependências, config do TypeORM e conexão com o Supabase

**Files:**
- Create: `.env.example`
- Create: `src/db/data-source.ts` (substitui o `.gitkeep` que já existe lá)
- Modify: `src/app.module.ts`
- Modify: `package.json` (scripts de migration)

**Interfaces:**
- Produces: `dataSourceOptions` (export nomeado de `src/db/data-source.ts`, tipo `DataSourceOptions` do pacote `typeorm`) — usado por `app.module.ts` (Task 1) e implicitamente pelo TypeORM CLI (Tasks 2-4, ao gerar/rodar migrations)

- [ ] **Step 1: Instalar dependências**

Run: `npm install @nestjs/typeorm typeorm pg @nestjs/config dotenv`

- [ ] **Step 2: Criar `.env.example`**

```
DATABASE_URL=postgresql://user:password@host:5432/postgres
```

- [ ] **Step 3: Criar `src/db/data-source.ts`**

```ts
import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [__dirname + '/../modules/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
```

- [ ] **Step 4: Remover o `.gitkeep` de `src/db/`**

Run: `rm src/db/.gitkeep` (ou apaga manualmente pelo VSCode — a pasta já tem conteúdo real agora)

- [ ] **Step 5: Atualizar `src/app.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CategoriesModule } from './modules/categories/categories.module';
import { ProductsModule } from './modules/products/products.module';
import { OrdersModule } from './modules/orders/orders.module';
import { dataSourceOptions } from './db/data-source';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(dataSourceOptions),
    CategoriesModule,
    ProductsModule,
    OrdersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

- [ ] **Step 6: Adicionar scripts de migration no `package.json`**

Dentro de `"scripts"`, adicionar:
```json
"typeorm": "typeorm-ts-node-commonjs -d src/db/data-source.ts",
"migration:generate": "npm run typeorm -- migration:generate",
"migration:run": "npm run typeorm -- migration:run",
"migration:revert": "npm run typeorm -- migration:revert"
```

- [ ] **Step 7: Verificar tipos**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: sem erros

- [ ] **Step 8: Verificar conexão real com o Supabase**

Run: `npm run migration:run`
Expected: conecta e imprime algo como `No migrations are pending` (não existe migration ainda — isso já prova que a conexão funcionou). Se der erro de conexão, o `.env`/`DATABASE_URL` está errado — corrigir antes de continuar.

- [ ] **Step 9: Formatar e commitar**

```bash
npm run format
git add .env.example src/db/data-source.ts src/app.module.ts package.json package-lock.json
git commit -m "feat: configure TypeORM connection to Supabase"
```

---

## Task 2: Persistir `categories`

**Files:**
- Modify: `src/modules/categories/entities/category.entity.ts`
- Modify: `src/modules/categories/categories.module.ts`
- Modify: `src/modules/categories/categories.service.ts`
- Modify: `src/modules/categories/categories.controller.ts`

**Interfaces:**
- Consumes: `dataSourceOptions` (Task 1, já conectado via `AppModule`)
- Produces: `Category` (entidade TypeORM, `@Entity('categories')`, campos `id: number`, `name: string`) — consumida pela Task 3 (`Product.category`); a relação inversa `Category.products: Product[]` **não** entra nesta task (ver nota abaixo) — a Task 3 volta neste arquivo pra completá-la, no mesmo padrão usado entre Product/OrderItem nas Tasks 3-4
- Produces: `CategoriesService` exportado do `CategoriesModule` (assinatura dos métodos não muda: `findAll(): Promise<Category[]>`, `findOne(id: number): Promise<Category>`, `create(dto: CreateCategoryDto): Promise<Category>`, `remove(id: number): Promise<void>`) — consumido pela Task 3 (`ProductsModule` importa `CategoriesModule`, injeta `CategoriesService`)

- [ ] **Step 1: Converter `Category` em entidade TypeORM**

```ts
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;
}
```

Sem relação `products` aqui de propósito. `@OneToMany` (com lambda OU com string) faz o TypeORM validar o nome da propriedade inversa contra os metadados reais de `Product` assim que a `DataSource` inicializa — o que acontece já no `migration:generate`/`migration:run`/boot do app, não só na compilação do TypeScript. Como `Product` só ganha o campo `category` na Task 3, qualquer forma de `@OneToMany` aqui (string incluída) quebraria em runtime com `Entity metadata for Category#products was not found`. A FK em si (`Product.categoryId` + `@JoinColumn`) não depende dessa relação inversa pra existir — ela só é conveniência de leitura (`category.products`), então fica de fora até a Task 3 poder adicioná-la com segurança.

- [ ] **Step 2: Registrar a entidade e exportar o service no módulo**

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { Category } from './entities/category.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Category])],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
```

- [ ] **Step 3: Trocar o array por `Repository<Category>` no service**

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
  ) {}

  findAll(): Promise<Category[]> {
    return this.categoriesRepository.find();
  }

  async findOne(id: number): Promise<Category> {
    const category = await this.categoriesRepository.findOneBy({ id });
    if (!category) {
      throw new NotFoundException(`Categoria ${id} não encontrada`);
    }
    return category;
  }

  create(dto: CreateCategoryDto): Promise<Category> {
    const category = this.categoriesRepository.create(dto);
    return this.categoriesRepository.save(category);
  }

  async remove(id: number): Promise<void> {
    const category = await this.findOne(id);
    await this.categoriesRepository.remove(category);
  }
}
```

- [ ] **Step 4: Atualizar tipos de retorno no controller**

```ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Delete,
  HttpCode,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll(): Promise<Category[]> {
    return this.categoriesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Category> {
    return this.categoriesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCategoryDto): Promise<Category> {
    return this.categoriesService.create(dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.categoriesService.remove(id);
  }
}
```

- [ ] **Step 5: Gerar e rodar a migration**

Run: `npm run migration:generate -- src/db/migrations/CreateCategories`
Expected: gera um arquivo em `src/db/migrations/` com `CREATE TABLE "categories"...`. Abra o arquivo e confira que faz sentido antes do próximo passo.

Run: `npm run migration:run`
Expected: aplica a migration, tabela `categories` criada no Supabase.

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: sem erros

- [ ] **Step 7: Testar manualmente**

Com `npm run start:dev` rodando:
- `POST /categories` `{"name":"Eletronicos"}` → `201`
- `GET /categories` → array com a categoria
- Reiniciar o servidor (ou só aguardar o watch reiniciar) e repetir `GET /categories` → categoria **continua lá** (prova que saiu da memória)

- [ ] **Step 8: Formatar e commitar**

```bash
npm run format
git add src/modules/categories src/db/migrations
git commit -m "feat: persist categories with TypeORM"
```

---

## Task 3: Persistir `products` (com FK pra `categories`)

**Files:**
- Modify: `src/modules/products/entities/product.entity.ts`
- Modify: `src/modules/categories/entities/category.entity.ts` (adiciona a relação inversa `products`, deixada pendente na Task 2)
- Modify: `src/modules/products/products.module.ts`
- Modify: `src/modules/products/products.service.ts`
- Modify: `src/modules/products/products.controller.ts`
- Modify: `src/modules/orders/orders.service.ts` (correção colateral mínima, temporária — ver Step 4b)
- Modify: `src/modules/orders/orders.controller.ts` (idem)

**Interfaces:**
- Consumes: `Category` (Task 2, `src/modules/categories/entities/category.entity.ts`), `CategoriesService.findOne(id: number): Promise<Category>` (Task 2, lança `NotFoundException` se não existir — reaproveitado aqui pra validar `categoryId` antes de criar/atualizar produto)
- Produces: `Product` (entidade TypeORM, `@Entity('products')`, campos `id: number`, `name: string`, `price: number`, `stock: number`, `categoryId: number`, relação `category: Category`) — consumida pela Task 4 (leitura/escrita direta via `EntityManager` na transação de criação de pedido; a Task 4 também adiciona a relação inversa `orderItems: OrderItem[]` nesta entidade — ver nota na Task 4)
- Produces: `ProductsService` exportado do `ProductsModule` (assinaturas: `findAll(): Promise<Product[]>`, `findOne(id: number): Promise<Product>`, `create(dto): Promise<Product>`, `update(id, dto): Promise<Product>`, `remove(id): Promise<void>`)

- [ ] **Step 1: Converter `Product` em entidade TypeORM**

```ts
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Category } from '../../categories/entities/category.entity';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column('float')
  price: number;

  @Column()
  stock: number;

  @Column()
  categoryId: number;

  @ManyToOne(() => Category, (category) => category.products)
  @JoinColumn({ name: 'categoryId' })
  category: Category;
}
```

A relação inversa (`Product.orderItems`) não entra aqui de propósito — ela referenciaria `OrderItem`, que só é criado na Task 4. Adicionar agora quebraria o boot da `DataSource` desta task (metadados de `OrderItem` inexistentes). A Task 4 volta neste arquivo pra completar a relação.

- [ ] **Step 1b: Completar a relação inversa em `Category`**

Agora que `Product` já tem o campo `category`, volta em `src/modules/categories/entities/category.entity.ts` e adiciona a relação que ficou pendente na Task 2:

```ts
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Product } from '../../products/entities/product.entity';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @OneToMany(() => Product, (product) => product.category)
  products: Product[];
}
```

Agora sim pode usar o lambda `(product) => product.category` — `Product.category` já existe de verdade a essa altura (Step 1 desta mesma task).

`price` usa `'float'` em vez de `'decimal'` de propósito: `decimal` no Postgres via `pg` volta como `string` no JS (evita perda de precisão binária, mas exige um transformer pra converter pra `number`, o que é complexidade desnecessária pra este projeto de aprendizado sem requisito real de precisão monetária).

- [ ] **Step 2: Registrar entidade e importar `CategoriesModule`**

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { Product } from './entities/product.entity';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [TypeOrmModule.forFeature([Product]), CategoriesModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
```

- [ ] **Step 3: Trocar o array por `Repository<Product>`, validar `categoryId`**

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CategoriesService } from '../categories/categories.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    private readonly categoriesService: CategoriesService,
  ) {}

  findAll(): Promise<Product[]> {
    return this.productsRepository.find();
  }

  async findOne(id: number): Promise<Product> {
    const product = await this.productsRepository.findOneBy({ id });
    if (!product) {
      throw new NotFoundException(`Produto ${id} não encontrado`);
    }
    return product;
  }

  async create(dto: CreateProductDto): Promise<Product> {
    await this.categoriesService.findOne(dto.categoryId);
    const product = this.productsRepository.create(dto);
    return this.productsRepository.save(product);
  }

  async update(id: number, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findOne(id);
    if (dto.categoryId !== undefined) {
      await this.categoriesService.findOne(dto.categoryId);
    }
    Object.assign(product, dto);
    return this.productsRepository.save(product);
  }

  async remove(id: number): Promise<void> {
    const product = await this.findOne(id);
    await this.productsRepository.remove(product);
  }
}
```

`create`/`update` chamam `categoriesService.findOne(categoryId)` antes de gravar — sem isso, um `categoryId` inexistente só falharia lá na hora do INSERT com erro de FK do Postgres (violação de constraint, 500 feio) em vez de um 404 claro.

- [ ] **Step 4: Atualizar tipos de retorno no controller**

```ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  HttpCode,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(): Promise<Product[]> {
    return this.productsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Product> {
    return this.productsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateProductDto): Promise<Product> {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
  ): Promise<Product> {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.productsService.remove(id);
  }
}
```

- [ ] **Step 4b: Correção colateral temporária em `orders`**

`ProductsService.findOne`/`update` agora retornam `Promise<Product>` (eram síncronos antes desta task). `OrdersService` (ainda não convertida — só na Task 4) chama esses dois métodos de forma síncrona e quebra a compilação do projeto inteiro, o que também impede o app de subir pro teste manual do Step 7. Correção mínima, só pra manter o build verde até a Task 4 reescrever esse arquivo inteiro:

Em `src/modules/orders/orders.service.ts`, troca só o método `create` (o resto do arquivo não muda):
```ts
  async create(dto: CreateOrderDto): Promise<Order> {
    let total = 0;
    const items: OrderItem[] = [];

    for (const item of dto.items) {
      const product = await this.productsService.findOne(item.productId);

      if (product.stock < item.quantity) {
        throw new BadRequestException(
          `Estoque insuficiente para o produto ${product.name}`,
        );
      }

      total += product.price * item.quantity;
      items.push({ productId: item.productId, quantity: item.quantity });

      await this.productsService.update(item.productId, {
        stock: product.stock - item.quantity,
      });
    }

    const order: Order = {
      id: this.nextId++,
      items,
      total,
      createdAt: new Date(),
    };
    this.orders.push(order);
    return order;
  }
```
(só virou `async` e ganhou dois `await` — `findAll`/`findOne` desse arquivo não chamam `ProductsService`, não precisam mudar)

Em `src/modules/orders/orders.controller.ts`, troca só o retorno do método `create`:
```ts
  @Post()
  create(@Body() dto: CreateOrderDto): Promise<Order> {
    return this.ordersService.create(dto);
  }
```

Esse é código descartável — a Task 4 reescreve `orders.service.ts`/`orders.controller.ts` por completo (inclusive removendo a dependência de `ProductsService`), então esse ajuste não precisa ser bonito, só compilar e funcionar até lá.

- [ ] **Step 5: Gerar e rodar a migration**

Run: `npm run migration:generate -- src/db/migrations/CreateProducts`
Expected: gera `CREATE TABLE "products"...` com FK pra `categories`. Revisar o arquivo antes de aplicar.

Run: `npm run migration:run`

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: sem erros

- [ ] **Step 7: Testar manualmente**

- `POST /products` com `categoryId` de uma categoria existente (criada na Task 2) → `201`
- `POST /products` com `categoryId: 9999` (inexistente) → `404` (não mais um erro feio de FK)
- `GET /products` → produto listado, sobrevive a restart

- [ ] **Step 8: Formatar e commitar**

```bash
npm run format
git add src/modules/products src/db/migrations
git commit -m "feat: persist products with TypeORM, validate categoryId"
```

---

## Task 4: Persistir `orders`/`order_items` com transação atômica

**Files:**
- Modify: `src/modules/orders/entities/order.entity.ts`
- Create: `src/modules/orders/entities/order-item.entity.ts`
- Modify: `src/modules/products/entities/product.entity.ts` (adiciona a relação inversa `orderItems`, deixada pendente na Task 3)
- Modify: `src/modules/orders/orders.module.ts`
- Modify: `src/modules/orders/orders.service.ts`
- Modify: `src/modules/orders/orders.controller.ts`

**Interfaces:**
- Consumes: `Product` (Task 3, `src/modules/products/entities/product.entity.ts`) — lido/gravado direto via `EntityManager` dentro da transação, sem passar por `ProductsService`
- Produces: `OrderItem` (entidade TypeORM, `@Entity('order_items')`, campos `id: number`, `quantity: number`, `orderId: number`, `productId: number`, relações `order: Order`, `product: Product`)
- Produces: `OrdersService.create(dto: CreateOrderDto): Promise<Order>` — não depende mais de `ProductsService` (mudança em relação à versão em memória: a versão anterior injetava `ProductsService`; esta versão usa `EntityManager` transacional direto, pelos motivos de atomicidade explicados na Architecture)

- [ ] **Step 1: Converter `Order` em entidade TypeORM, criar `OrderItem`**

`src/modules/orders/entities/order.entity.ts`:
```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OrderItem } from './order-item.entity';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('float')
  total: number;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];
}
```

`src/modules/orders/entities/order-item.entity.ts` (arquivo novo):
```ts
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { Product } from '../../products/entities/product.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  quantity: number;

  @Column()
  orderId: number;

  @ManyToOne(() => Order, (order) => order.items)
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column()
  productId: number;

  @ManyToOne(() => Product, (product) => product.orderItems)
  @JoinColumn({ name: 'productId' })
  product: Product;
}
```

Agora que `OrderItem` existe, completa a relação inversa que ficou pendente em `src/modules/products/entities/product.entity.ts`: adiciona o import `import { OrderItem } from '../../orders/entities/order-item.entity';` e o campo, dentro da classe `Product`:
```ts
  @OneToMany(() => OrderItem, (item) => item.product)
  orderItems: OrderItem[];
```
(lembra de adicionar `OneToMany` na lista de imports de `typeorm` nesse arquivo também)

- [ ] **Step 2: Registrar as duas entidades no módulo**

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem])],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
```

- [ ] **Step 3: Reescrever o service com transação**

```ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Product } from '../products/entities/product.entity';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
  ) {}

  findAll(): Promise<Order[]> {
    return this.ordersRepository.find({ relations: ['items'] });
  }

  async findOne(id: number): Promise<Order> {
    const order = await this.ordersRepository.findOne({
      where: { id },
      relations: ['items'],
    });
    if (!order) {
      throw new NotFoundException(`Pedido ${id} não encontrado`);
    }
    return order;
  }

  create(dto: CreateOrderDto): Promise<Order> {
    return this.ordersRepository.manager.transaction(async (manager) => {
      let total = 0;
      const items: OrderItem[] = [];

      for (const item of dto.items) {
        const product = await manager.findOneBy(Product, {
          id: item.productId,
        });
        if (!product) {
          throw new NotFoundException(
            `Produto ${item.productId} não encontrado`,
          );
        }
        if (product.stock < item.quantity) {
          throw new BadRequestException(
            `Estoque insuficiente para o produto ${product.name}`,
          );
        }

        total += product.price * item.quantity;

        const orderItem = new OrderItem();
        orderItem.productId = item.productId;
        orderItem.quantity = item.quantity;
        items.push(orderItem);

        product.stock -= item.quantity;
        await manager.save(product);
      }

      const order = manager.create(Order, { total, items });
      return manager.save(order);
    });
  }
}
```

Se qualquer item do loop falhar (produto não existe, ou estoque insuficiente), a `transaction()` do TypeORM reverte automaticamente tudo que já rodou dentro dela nessa chamada — nenhum estoque fica abatido pela metade.

- [ ] **Step 4: Atualizar tipos de retorno no controller**

```ts
import { Controller, Get, Post, Body, Param, ParseIntPipe } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { Order } from './entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll(): Promise<Order[]> {
    return this.ordersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Order> {
    return this.ordersService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateOrderDto): Promise<Order> {
    return this.ordersService.create(dto);
  }
}
```

- [ ] **Step 5: Gerar e rodar a migration**

Run: `npm run migration:generate -- src/db/migrations/CreateOrders`
Expected: gera `CREATE TABLE "orders"...` e `CREATE TABLE "order_items"...` com FKs. Revisar antes de aplicar.

Run: `npm run migration:run`

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: sem erros

- [ ] **Step 7: Testar manualmente — fluxo completo**

- `POST /categories` → categoria
- `POST /products` (com `categoryId` dela, `stock: 10`) → produto
- `POST /orders` `{"items":[{"productId":<id>,"quantity":3}]}` → `201`, `total` calculado certo
- `GET /products/:id` → `stock` abateu pra `7`
- `POST /orders` pedindo `quantity` maior que o estoque restante → `400`, estoque **não muda** (prova a transação)
- Reiniciar o servidor, `GET /orders` → pedido continua lá

- [ ] **Step 8: Formatar e commitar**

```bash
npm run format
git add src/modules/orders src/db/migrations
git commit -m "feat: persist orders with transactional stock handling"
```
