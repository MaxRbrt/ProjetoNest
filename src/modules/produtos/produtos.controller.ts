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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Paginado } from '../../common/dto/paginado';
import { ApiPaginatedResponse } from '../../common/dto/resposta-paginada.dto';
import { ProdutosService } from './produtos.service';
import { Produto } from './produto.entity';
import { CriarProdutoDto } from './dto/criar-produto.dto';
import { AtualizarProdutoDto } from './dto/atualizar-produto.dto';
import { ConsultaDeProdutosDto } from './dto/consulta-de-produtos.dto';
import { Papeis } from '../../decorators/papeis.decorator';
import { Papel } from '../usuarios/usuario.entity';

// ---------------------------------------------
// Catálogo de produtos
// Leitura liberada a qualquer usuário autenticado; escrita restrita a ADMIN.
// ---------------------------------------------
@ApiBearerAuth('access-token')
@Controller('products')
export class ProdutosController {
  constructor(private readonly produtosService: ProdutosService) {}

  // ---------------------------------------------
  // Listagem de produtos
  // ---------------------------------------------
  @Get()
  @ApiPaginatedResponse(Produto)
  listar(@Query() query: ConsultaDeProdutosDto): Promise<Paginado<Produto>> {
    return this.produtosService.listar(query);
  }

  // ---------------------------------------------
  // Consulta de produto por identificador
  // ---------------------------------------------
  @Get(':id')
  buscarPorId(@Param('id', ParseIntPipe) id: number): Promise<Produto> {
    return this.produtosService.buscarPorId(id);
  }

  // ---------------------------------------------
  // Criação de produto
  // ---------------------------------------------
  @Papeis(Papel.ADMIN)
  @Post()
  criar(@Body() dto: CriarProdutoDto): Promise<Produto> {
    return this.produtosService.criar(dto);
  }

  // ---------------------------------------------
  // Atualização de produto
  // ---------------------------------------------
  @Papeis(Papel.ADMIN)
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AtualizarProdutoDto,
  ): Promise<Produto> {
    return this.produtosService.atualizar(id, dto);
  }

  // ---------------------------------------------
  // Remoção de produto
  // ---------------------------------------------
  @Papeis(Papel.ADMIN)
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.produtosService.remover(id);
  }
}
