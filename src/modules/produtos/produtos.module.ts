import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProdutosController } from './produtos.controller';
import { ProdutosService } from './produtos.service';
import { Produto } from './produto.entity';
import { CategoriasModule } from '../categorias/categorias.module';

// ---------------------------------------------
// Composição do módulo de produtos
// ---------------------------------------------
@Module({
  imports: [TypeOrmModule.forFeature([Produto]), CategoriasModule],
  controllers: [ProdutosController],
  providers: [ProdutosService],
  exports: [ProdutosService],
})
export class ProdutosModule {}
