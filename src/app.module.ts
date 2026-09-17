import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, minutes } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { CategoriasModule } from './modules/categorias/categorias.module';
import { ProdutosModule } from './modules/produtos/produtos.module';
import { PedidosModule } from './modules/pedidos/pedidos.module';
import { EnderecosModule } from './modules/enderecos/enderecos.module';
import { FreteModule } from './modules/frete/frete.module';
import { PagamentosModule } from './modules/pagamentos/pagamentos.module';
import { MetricasModule } from './modules/metricas/metricas.module';
import { criarOpcoesDaFonteDeDados } from './db/opcoes-do-banco';
import { validarAmbiente } from './config/validacao-de-ambiente';
import { AutenticacaoModule } from './modules/auth/autenticacao.module';
import { GuardaDeAutenticacao } from './modules/auth/guards/autenticacao.guard';
import { GuardaDePapel } from './modules/auth/guards/papel.guard';

@Module({
  imports: [
    // ---------------------------------------------
    // Configuração e infraestrutura globais
    // ---------------------------------------------
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validarAmbiente,
    }),
    // ---------------------------------------------
    // Conexão com o banco
    // forRootAsync, injetando ConfigService, em vez de forRoot com a
    // constante de db/fonte-de-dados.ts: aquela constante é avaliada na
    // importação do módulo, antes do Nest sequer iniciar — DATABASE_URL
    // ausente derrubava a aplicação com um erro cru do Node, ignorando
    // qualquer outra variável de ambiente quebrada. Injetar ConfigService
    // garante que este factory só roda depois que validarAmbiente já
    // validou tudo, preservando a promessa de falhar listando todos os
    // problemas de uma vez.
    // ---------------------------------------------
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        criarOpcoesDaFonteDeDados({
          DATABASE_URL: config.get<string>('DATABASE_URL'),
          NODE_ENV: config.get<string>('NODE_ENV'),
          TEST_DATABASE_URL: config.get<string>('TEST_DATABASE_URL'),
        }),
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: minutes(1), limit: 100 }],
    }),
    // ---------------------------------------------
    // Módulos de domínio
    // ---------------------------------------------
    CategoriasModule,
    ProdutosModule,
    PedidosModule,
    EnderecosModule,
    FreteModule,
    PagamentosModule,
    MetricasModule,
    AutenticacaoModule,
  ],
  controllers: [AppController],
  providers: [
    // ---------------------------------------------
    // Guards globais
    // A ordem importa: autenticação roda antes do throttling, então uma
    // requisição sem token nunca chega a consumir cota de rate limit. Toda
    // rota nasce protegida; @Publico() é a única exceção explícita. GuardaDePapel
    // depende de request.user já preenchido pelo GuardaDeAutenticacao, por isso vem
    // logo depois dele. ThrottlerGuard define o limite padrão global; rotas
    // sensíveis podem sobrescrever com políticas mais restritivas.
    // ---------------------------------------------
    {
      provide: APP_GUARD,
      useClass: GuardaDeAutenticacao,
    },
    {
      provide: APP_GUARD,
      useClass: GuardaDePapel,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
