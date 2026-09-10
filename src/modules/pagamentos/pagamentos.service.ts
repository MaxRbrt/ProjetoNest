import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { Pedido, SituacaoDoPedido } from '../pedidos/entities/pedido.entity';
import { Papel } from '../usuarios/usuario.entity';
import { UsuarioPublico } from '../usuarios/usuarios.service';
import { Pagamento, SituacaoDoPagamento } from './entities/pagamento.entity';
import { IniciarPagamentoDto } from './dto/iniciar-pagamento.dto';
import { WebhookDePagamentoDto } from './dto/webhook-de-pagamento.dto';
import {
  assinarEvento,
  eventoDentroDaJanela,
  verificarAssinatura,
  type EventoDePagamento,
} from './assinatura-de-webhook';
import { decidirPagamento, ultimosDigitos } from './provedor-de-pagamento-simulado';

@Injectable()
export class PagamentosService {
  private readonly segredoDoWebhook: string;

  constructor(
    @InjectRepository(Pedido)
    private readonly repositorioDePedidos: Repository<Pedido>,
    config: ConfigService,
  ) {
    this.segredoDoWebhook = config.getOrThrow<string>('PAYMENT_WEBHOOK_SECRET');
  }

  // ---------------------------------------------
  // Início de pagamento
  // O pedido é travado e sua situação conferida sob lock: só é possível
  // iniciar pagamento de pedido PENDENTE. É essa checagem, não uma constraint
  // de unicidade em Pagamento, que impede pagar duas vezes — depois que o
  // primeiro pagamento aprova e o pedido vira PAGO, qualquer nova tentativa
  // esbarra aqui. Cartão recusado deixa o pedido PENDENTE, permitindo tentar
  // de novo com outro cartão — uma linha de Pagamento por tentativa, não uma
  // por pedido.
  //
  // A confirmação do resultado passa pelo MESMO caminho que um provedor
  // externo real usaria — processarWebhook, com verificação de assinatura —
  // em vez de um atalho que aplicaria o resultado direto. Criação e
  // confirmação são duas transações separadas (não uma transação aninhada):
  // é exatamente como funcionaria com um provedor de verdade, que cria a
  // cobrança agora e confirma depois, numa requisição separada.
  // ---------------------------------------------
  async criarIntencao(
    pedidoId: number,
    usuario: UsuarioPublico,
    dto: IniciarPagamentoDto,
  ): Promise<Pagamento> {
    const pagamentoPendente = await this.repositorioDePedidos.manager.transaction(
      async (manager) => {
        const pedido = await manager.findOne(Pedido, {
          where:
            usuario.papel === Papel.ADMIN
              ? { id: pedidoId }
              : { id: pedidoId, usuarioId: usuario.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!pedido) {
          throw new NotFoundException(`Pedido ${pedidoId} não encontrado`);
        }
        if (pedido.situacao !== SituacaoDoPedido.PENDENTE) {
          throw new ConflictException(
            `Pedido não está pendente de pagamento (situação atual: ${pedido.situacao}).`,
          );
        }

        const pagamento = manager.create(Pagamento, {
          pedidoId: pedido.id,
          status: SituacaoDoPagamento.PENDENTE,
          ultimosDigitosDoCartao: ultimosDigitos(dto.numeroDoCartao),
          motivoDeRecusa: null,
        });
        return manager.save(pagamento);
      },
    );

    const { resultado } = decidirPagamento(dto.numeroDoCartao);
    const evento: EventoDePagamento = {
      eventId: randomUUID(),
      pagamentoId: pagamentoPendente.id,
      pedidoId,
      status: resultado,
      timestamp: Date.now(),
    };
    const assinatura = assinarEvento(evento, this.segredoDoWebhook);

    const webhookDto: WebhookDePagamentoDto = {
      eventId: evento.eventId,
      pagamentoId: evento.pagamentoId,
      pedidoId: evento.pedidoId,
      status: evento.status,
      timestamp: evento.timestamp,
    };

    try {
      return await this.processarWebhook(webhookDto, assinatura);
    } catch {
      // Se a confirmação falhar por motivo alheio ao resultado do provedor
      // (ex.: instabilidade de banco entre a criação da tentativa e o
      // processamento do webhook), a tentativa não pode ficar PENDENTE para
      // sempre — órfã, sem ninguém para reprocessá-la. Resolvida aqui como
      // recusada (mesma UX de cartão recusado: pedido continua PENDENTE,
      // cliente tenta de novo com uma tentativa nova).
      pagamentoPendente.status = SituacaoDoPagamento.RECUSADO;
      pagamentoPendente.motivoDeRecusa =
        'Falha ao confirmar o pagamento. Tente novamente.';
      return this.repositorioDePedidos.manager.save(pagamentoPendente);
    }
  }

  // ---------------------------------------------
  // Confirmação de pagamento via webhook
  // Único caminho que move PENDENTE -> PAGO. Ordem deliberada: assinatura
  // primeiro (rejeita forjado antes de gastar qualquer leitura de banco),
  // depois janela de replay, depois idempotência (INSERT do eventId como
  // trava — ver o comentário na entidade), só então a transição de estado.
  // Reentrega do mesmo evento (webhook real reentrega em timeout/instabilidade
  // de rede) é idempotente: a segunda chamada esbarra na violação de
  // unicidade do eventId e devolve o pagamento já resolvido, sem reprocessar.
  // ---------------------------------------------
  async processarWebhook(
    dto: WebhookDePagamentoDto,
    assinaturaRecebida: string | undefined,
  ): Promise<Pagamento> {
    const evento: EventoDePagamento = {
      eventId: dto.eventId,
      pagamentoId: dto.pagamentoId,
      pedidoId: dto.pedidoId,
      status: dto.status,
      timestamp: dto.timestamp,
    };

    if (
      !assinaturaRecebida ||
      !verificarAssinatura(evento, assinaturaRecebida, this.segredoDoWebhook)
    ) {
      throw new UnauthorizedException('Assinatura do webhook inválida.');
    }
    if (!eventoDentroDaJanela(evento, Date.now())) {
      throw new BadRequestException('Evento de webhook expirado.');
    }

    return this.repositorioDePedidos.manager.transaction(async (manager) => {
      // ---------------------------------------------
      // Trava de idempotência sem poluir a transação
      // Capturar a exceção de violação de unicidade não bastava: no Postgres,
      // uma instrução que falha deixa a transação inteira em estado
      // "aborted" — qualquer query seguinte na mesma transação falha com
      // "current transaction is aborted", mesmo que o erro anterior tenha
      // sido tratado no lado do Node. ON CONFLICT DO NOTHING nunca falha a
      // instrução: ou insere e devolve a linha, ou não insere e não devolve
      // nada — os dois casos são sucesso do ponto de vista do Postgres, e a
      // transação segue utilizável.
      // ---------------------------------------------
      const insercao: Array<{ eventId: string }> = await manager.query(
        `INSERT INTO "payment_webhook_events" ("eventId", "paymentId")
           VALUES ($1, $2)
           ON CONFLICT ("eventId") DO NOTHING
           RETURNING "eventId"`,
        [evento.eventId, evento.pagamentoId],
      );
      const jaProcessado = insercao.length === 0;

      if (jaProcessado) {
        const pagamentoJaProcessado = await manager.findOne(Pagamento, {
          where: { id: evento.pagamentoId },
        });
        if (!pagamentoJaProcessado) {
          throw new NotFoundException(
            `Pagamento ${evento.pagamentoId} não encontrado`,
          );
        }
        return pagamentoJaProcessado;
      }

      const pagamento = await manager.findOne(Pagamento, {
        where: { id: evento.pagamentoId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!pagamento) {
        throw new NotFoundException(
          `Pagamento ${evento.pagamentoId} não encontrado`,
        );
      }
      if (pagamento.status !== SituacaoDoPagamento.PENDENTE) {
        // Resolvido antes por outro evento — idempotente, devolve como está.
        return pagamento;
      }

      const pedido = await manager.findOne(Pedido, {
        where: { id: pagamento.pedidoId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!pedido) {
        throw new NotFoundException(
          `Pedido ${pagamento.pedidoId} não encontrado`,
        );
      }

      if (evento.status === 'RECUSADO') {
        pagamento.status = SituacaoDoPagamento.RECUSADO;
        pagamento.motivoDeRecusa =
          'Cartão recusado pela operadora (simulado).';
      } else if (pedido.situacao !== SituacaoDoPedido.PENDENTE) {
        // Corrida: outra tentativa de pagamento (ou um cancelamento) já
        // resolveu o pedido enquanto este evento estava a caminho. Aprovar
        // agora criaria um pedido pago duas vezes ou um PAGO depois de
        // CANCELADO — esta tentativa perde a corrida.
        pagamento.status = SituacaoDoPagamento.RECUSADO;
        pagamento.motivoDeRecusa =
          'Pedido não estava mais pendente quando o pagamento foi confirmado.';
      } else {
        pagamento.status = SituacaoDoPagamento.APROVADO;
        pedido.situacao = SituacaoDoPedido.PAGO;
        await manager.save(pedido);
      }

      return manager.save(pagamento);
    });
  }

  // ---------------------------------------------
  // Histórico de tentativas de pagamento de um pedido
  // ---------------------------------------------
  async listarPorPedido(
    pedidoId: number,
    usuario: UsuarioPublico,
  ): Promise<Pagamento[]> {
    const pedido = await this.repositorioDePedidos.findOne({
      where:
        usuario.papel === Papel.ADMIN
          ? { id: pedidoId }
          : { id: pedidoId, usuarioId: usuario.id },
    });
    if (!pedido) {
      throw new NotFoundException(`Pedido ${pedidoId} não encontrado`);
    }

    return this.repositorioDePedidos.manager.find(Pagamento, {
      where: { pedidoId },
      order: { criadoEm: 'DESC' },
    });
  }
}
