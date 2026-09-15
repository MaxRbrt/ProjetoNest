import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  NotFoundException,
  Param,
  ParseIntPipe,
  HttpCode,
  Query,
  Res,
  UseFilters,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { Paginado } from '../../common/dto/paginado';
import { ApiPaginatedResponse } from '../../common/dto/resposta-paginada.dto';
import { ProdutosService } from './produtos.service';
import { Produto } from './produto.entity';
import { CriarProdutoDto } from './dto/criar-produto.dto';
import { AtualizarProdutoDto } from './dto/atualizar-produto.dto';
import { ConsultaDeProdutosDto } from './dto/consulta-de-produtos.dto';
import { Papeis } from '../../decorators/papeis.decorator';
import { Papel } from '../usuarios/usuario.entity';
import { Publico } from '../../decorators/publico.decorator';
import { FiltroDeErroDeUpload } from './imagens/filtro-de-erro-de-upload';

// ---------------------------------------------
// Catálogo de produtos
// Leitura pública, sem exigir token: o catálogo é a vitrine da loja e precisa
// ser navegável por visitante, antes de qualquer cadastro. Criar, alterar e
// remover continuam restritos a ADMIN por @Papeis(Papel.ADMIN) — a vitrine é
// aberta, o estoque de quem a mantém não.
// ---------------------------------------------
@ApiBearerAuth('access-token')
@Controller('products')
export class ProdutosController {
  constructor(private readonly produtosService: ProdutosService) {}

  // ---------------------------------------------
  // Listagem de produtos
  // ---------------------------------------------
  @Publico()
  @Get()
  @ApiPaginatedResponse(Produto)
  listar(@Query() query: ConsultaDeProdutosDto): Promise<Paginado<Produto>> {
    return this.produtosService.listar(query);
  }

  // ---------------------------------------------
  // Envio da imagem do produto
  // O limite de tamanho vive no multer, e não numa checagem depois: assim o
  // arquivo grande é cortado no transporte, sem virar Buffer inteiro em
  // memória antes de ser recusado. A rota não aceita texto: limitar campos,
  // arquivos e partes impede que um multipart válido acumule dados ignorados
  // em req.body antes de chegar à validação de arquivo.
  // ---------------------------------------------
  @Papeis(Papel.ADMIN)
  @Post(':id/image')
  @UseFilters(FiltroDeErroDeUpload)
  @UseInterceptors(
    FileInterceptor('imagem', {
      limits: { fileSize: 2 * 1024 * 1024, fields: 0, files: 1, parts: 2 },
    }),
  )
  definirImagem(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() arquivo?: Express.Multer.File,
  ): Promise<Produto> {
    if (!arquivo) {
      throw new BadRequestException('Envie a imagem no campo "imagem".');
    }
    return this.produtosService.definirImagem(id, arquivo.buffer);
  }

  // ---------------------------------------------
  // Remoção da imagem do produto
  // ---------------------------------------------
  @Papeis(Papel.ADMIN)
  @Delete(':id/image')
  removerImagem(@Param('id', ParseIntPipe) id: number): Promise<Produto> {
    return this.produtosService.removerImagem(id);
  }

  // ---------------------------------------------
  // Entrega da imagem
  // Pública por necessidade, não por conveniência: a tag <img> do navegador
  // não envia o cabeçalho Authorization, e o access token deste projeto vive
  // em memória, fora de cookie. Uma rota autenticada aqui simplesmente nunca
  // exibiria imagem nenhuma.
  //
  // O Cross-Origin-Resource-Policy é obrigatório porque o helmet() global
  // envia same-origin: sem esta linha, o navegador bloqueia a imagem servida
  // por :3000 dentro da página em :3001 sem erro de rede visível — a imagem
  // apenas não aparece.
  //
  // O cache é curto de propósito. A aplicação acrescenta o nome do arquivo
  // como parâmetro de versão, mas esta URL também responde sem ele, e quem a
  // acessar direto não pode ficar presa a uma foto trocada.
  //
  // Declarada antes de @Get(':id') de propósito: embora o Express só case
  // ':id' com um único segmento (e por isso não colidiria de qualquer jeito
  // com ':id/image'), a ordem aqui documenta a garantia em vez de presumi-la.
  // ---------------------------------------------
  @Publico()
  @Get(':id/image')
  async entregarImagem(
    @Param('id', ParseIntPipe) id: number,
    @Res() resposta: Response,
  ): Promise<void> {
    const imagem = await this.produtosService.lerImagem(id);
    if (!imagem) {
      throw new NotFoundException(`Produto ${id} não tem imagem`);
    }
    resposta
      .setHeader('Content-Type', imagem.contentType)
      .setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
      .setHeader('Cache-Control', 'public, max-age=300')
      .send(imagem.conteudo);
  }

  // ---------------------------------------------
  // Consulta de produto por identificador
  // ---------------------------------------------
  @Publico()
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
