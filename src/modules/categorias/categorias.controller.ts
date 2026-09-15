import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  ParseIntPipe,
  Patch,
  Query,
  Delete,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Paginado } from '../../common/dto/paginado';
import { ApiPaginatedResponse } from '../../common/dto/resposta-paginada.dto';
import { ConsultaPaginadaDto } from '../../common/dto/consulta-paginada.dto';
import { CategoriasService } from './categorias.service';
import { Categoria } from './categoria.entity';
import { CriarCategoriaDto } from './dto/criar-categoria.dto';
import { AtualizarCategoriaDto } from './dto/atualizar-categoria.dto';
import { Papeis } from '../../decorators/papeis.decorator';
import { Papel } from '../usuarios/usuario.entity';
import { Publico } from '../../decorators/publico.decorator';

// ---------------------------------------------
// Catálogo de categorias
// Leitura pública pelo mesmo motivo de GET /products: a vitrine navega por
// categoria (cabeçalho, menu e filtro) antes de qualquer login, e sem isso o
// visitante recebe 401 e vê a navegação vazia. A entidade só expõe id e nome;
// a relação com produtos não é carregada. @Publico() fica em cada leitura, não
// na classe, para que criar, alterar e remover sigam exigindo token e ADMIN.
// ---------------------------------------------
@ApiBearerAuth('access-token')
@Controller('categories')
export class CategoriasController {
  constructor(private readonly categoriasService: CategoriasService) {}

  // ---------------------------------------------
  // Listagem de categorias
  // ---------------------------------------------
  @Publico()
  @Get()
  @ApiPaginatedResponse(Categoria)
  listar(@Query() query: ConsultaPaginadaDto): Promise<Paginado<Categoria>> {
    return this.categoriasService.listar(query);
  }

  // ---------------------------------------------
  // Consulta de categoria por identificador
  // ---------------------------------------------
  @Publico()
  @Get(':id')
  buscarPorId(@Param('id', ParseIntPipe) id: number): Promise<Categoria> {
    return this.categoriasService.buscarPorId(id);
  }

  // ---------------------------------------------
  // Criação de categoria
  // ---------------------------------------------
  @Papeis(Papel.ADMIN)
  @Post()
  criar(@Body() dto: CriarCategoriaDto): Promise<Categoria> {
    return this.categoriasService.criar(dto);
  }

  // ---------------------------------------------
  // Atualização de categoria
  // ---------------------------------------------
  @Papeis(Papel.ADMIN)
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AtualizarCategoriaDto,
  ): Promise<Categoria> {
    return this.categoriasService.atualizar(id, dto);
  }

  // ---------------------------------------------
  // Remoção de categoria
  // ---------------------------------------------
  @Papeis(Papel.ADMIN)
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.categoriasService.remover(id);
  }
}
