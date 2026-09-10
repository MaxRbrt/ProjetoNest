import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Publico } from '../../decorators/publico.decorator';
import { UsuarioAtual } from '../../decorators/usuario-atual.decorator';
import type { UsuarioPublico } from '../usuarios/usuarios.service';
import { PagamentosService } from './pagamentos.service';
import { Pagamento } from './entities/pagamento.entity';
import { IniciarPagamentoDto } from './dto/iniciar-pagamento.dto';
import { WebhookDePagamentoDto } from './dto/webhook-de-pagamento.dto';

@Controller()
export class PagamentosController {
  constructor(private readonly pagamentosService: PagamentosService) {}

  @ApiBearerAuth('access-token')
  @Post('orders/:id/payments')
  criar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IniciarPagamentoDto,
    @UsuarioAtual() usuario: UsuarioPublico,
  ): Promise<Pagamento> {
    return this.pagamentosService.criarIntencao(id, usuario, dto);
  }

  @ApiBearerAuth('access-token')
  @Get('orders/:id/payments')
  listar(
    @Param('id', ParseIntPipe) id: number,
    @UsuarioAtual() usuario: UsuarioPublico,
  ): Promise<Pagamento[]> {
    return this.pagamentosService.listarPorPedido(id, usuario);
  }

  // ---------------------------------------------
  // Webhook do provedor de pagamento
  // Rota pública de propósito: um provedor de pagamento real não tem o
  // access token de ninguém, só a assinatura HMAC do evento — que é
  // verificada dentro do serviço antes de qualquer efeito. @Publico() só
  // dispensa o JWT; não dispensa autenticação, que aqui é a assinatura.
  // ---------------------------------------------
  @Publico()
  @Post('payments/webhook')
  webhook(
    @Body() dto: WebhookDePagamentoDto,
    @Headers('payment-signature') assinatura: string | undefined,
  ): Promise<Pagamento> {
    return this.pagamentosService.processarWebhook(dto, assinatura);
  }
}
