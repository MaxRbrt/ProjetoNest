import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { UsuarioAtual } from '../../decorators/usuario-atual.decorator';
import type { UsuarioPublico } from '../usuarios/usuarios.service';
import { EnderecosService } from './enderecos.service';
import { Endereco } from './endereco.entity';
import { CriarEnderecoDto } from './dto/criar-endereco.dto';
import { AtualizarEnderecoDto } from './dto/atualizar-endereco.dto';

// ---------------------------------------------
// Endereços do usuário autenticado
// Sem paginação de propósito: ninguém cadastra dezenas de endereços de
// entrega, e a tela de checkout precisa da lista inteira de uma vez para
// pré-selecionar o principal.
// ---------------------------------------------
@ApiBearerAuth('access-token')
@Controller('addresses')
export class EnderecosController {
  constructor(private readonly enderecosService: EnderecosService) {}

  @Get()
  listar(@UsuarioAtual() usuario: UsuarioPublico): Promise<Endereco[]> {
    return this.enderecosService.listar(usuario.id);
  }

  @Get(':id')
  buscarPorId(
    @Param('id', ParseIntPipe) id: number,
    @UsuarioAtual() usuario: UsuarioPublico,
  ): Promise<Endereco> {
    return this.enderecosService.buscarPorId(id, usuario.id);
  }

  @Post()
  criar(
    @Body() dto: CriarEnderecoDto,
    @UsuarioAtual() usuario: UsuarioPublico,
  ): Promise<Endereco> {
    return this.enderecosService.criar(usuario.id, dto);
  }

  @Patch(':id')
  atualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AtualizarEnderecoDto,
    @UsuarioAtual() usuario: UsuarioPublico,
  ): Promise<Endereco> {
    return this.enderecosService.atualizar(id, usuario.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remover(
    @Param('id', ParseIntPipe) id: number,
    @UsuarioAtual() usuario: UsuarioPublico,
  ): Promise<void> {
    return this.enderecosService.remover(id, usuario.id);
  }
}
