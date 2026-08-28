import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, minutes } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CategoriesModule } from './modules/categorias/categories.module';
import { ProductsModule } from './modules/produtos/products.module';
import { OrdersModule } from './modules/pedidos/orders.module';
import { dataSourceOptions } from './db/data-source';
import { validateEnvironment } from './config/env.validation';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';

@Module({
  imports: [
    // ---------------------------------------------
    // Configuração e infraestrutura globais
    // ---------------------------------------------
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    TypeOrmModule.forRoot(dataSourceOptions),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: minutes(1), limit: 100 }],
    }),
    // ---------------------------------------------
    // Módulos de domínio
    // ---------------------------------------------
    CategoriesModule,
    ProductsModule,
    OrdersModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // ---------------------------------------------
    // Guards globais
    // A ordem importa: autenticação roda antes do throttling, então uma
    // requisição sem token nunca chega a consumir cota de rate limit. Toda
    // rota nasce protegida; @Public() é a única exceção explícita. RolesGuard
    // depende de request.user já preenchido pelo JwtAuthGuard, por isso vem
    // logo depois dele. ThrottlerGuard define o limite padrão global; rotas
    // sensíveis podem sobrescrever com políticas mais restritivas.
    // ---------------------------------------------
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
