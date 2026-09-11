import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProdutosController } from './produtos.controller';
import { ProdutosService } from './produtos.service';
import { Produto } from './produto.entity';
import { CategoriasModule } from '../categorias/categorias.module';
import { ARMAZENAMENTO_DE_IMAGENS } from './imagens/armazenamento-de-imagens';
import { ArmazenamentoEmDisco } from './imagens/armazenamento-em-disco';

// ---------------------------------------------
// Composição do módulo de produtos
// O armazenamento de imagens é resolvido aqui via factory: o diretório vem
// de UPLOAD_DIR (ConfigModule já é global, então ConfigService está
// disponível sem import extra) e a implementação concreta (disco, por
// enquanto) fica isolada deste ponto único de composição.
// ---------------------------------------------
@Module({
  imports: [TypeOrmModule.forFeature([Produto]), CategoriasModule],
  controllers: [ProdutosController],
  providers: [
    ProdutosService,
    {
      provide: ARMAZENAMENTO_DE_IMAGENS,
      useFactory: (config: ConfigService) =>
        new ArmazenamentoEmDisco(config.getOrThrow<string>('UPLOAD_DIR')),
      inject: [ConfigService],
    },
  ],
  exports: [ProdutosService],
})
export class ProdutosModule {}
