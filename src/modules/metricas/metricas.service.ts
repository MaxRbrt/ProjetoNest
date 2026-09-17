import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Pagamento,
  SituacaoDoPagamento,
} from '../pagamentos/entities/pagamento.entity';
import { Pedido, SituacaoDoPedido } from '../pedidos/entities/pedido.entity';
import {
  calcularJanelas,
  FUSO_DA_LOJA,
  type Janelas,
  type Periodo,
} from './janela-de-periodo';
import type { MetricasDoPainel, VendasDoDia } from './dto/metricas.dto';

const SITUACOES_FATURADAS = [
  SituacaoDoPedido.PAGO,
  SituacaoDoPedido.ENVIADO,
  SituacaoDoPedido.ENTREGUE,
];

// orders.createdAt é TIMESTAMP sem fuso gravado em UTC (DEFAULT now() numa
// sessão UTC): AT TIME ZONE 'UTC' o transforma no instante real antes de
// comparar com a janela ou converter para o dia de São Paulo.
const INSTANTE_DO_PEDIDO = `("pedido"."createdAt" AT TIME ZONE 'UTC')`;
const DENTRO_DA_ATUAL = `${INSTANTE_DO_PEDIDO} >= :inicioAtual AND ${INSTANTE_DO_PEDIDO} < :fimAtual`;
const DENTRO_DA_ANTERIOR = `${INSTANTE_DO_PEDIDO} >= :inicioAnterior AND ${INSTANTE_DO_PEDIDO} < :fimAnterior`;
const FATURADO = `"pedido"."status" IN (:...faturadas)`;
const NAO_CANCELADO = `"pedido"."status" <> :cancelado`;

const PAGAMENTO_NA_ATUAL = `"pagamento"."createdAt" >= :inicioAtual AND "pagamento"."createdAt" < :fimAtual`;
const PAGAMENTO_NA_ANTERIOR = `"pagamento"."createdAt" >= :inicioAnterior AND "pagamento"."createdAt" < :fimAnterior`;

type Linha = Record<string, string | number | null>;

// ---------------------------------------------
// Métricas do painel administrativo
// Três leituras agregadas, todas parametrizadas: resumo de pedidos das duas
// janelas numa consulta só (somas com FILTER), resumo de pagamentos no mesmo
// formato e a série diária da janela atual. O banco só devolve números; os
// dias sem venda são preenchidos aqui a partir da lista de dias da janela.
// "agora" é recebido de fora para o teste fixar o relógio.
// ---------------------------------------------
@Injectable()
export class MetricasService {
  constructor(
    @InjectRepository(Pedido)
    private readonly pedidos: Repository<Pedido>,
    @InjectRepository(Pagamento)
    private readonly pagamentos: Repository<Pagamento>,
  ) {}

  async obter(
    periodo: Periodo,
    agora: Date = new Date(),
  ): Promise<MetricasDoPainel> {
    const janelas = calcularJanelas(periodo, agora);
    const parametros = {
      inicioAtual: janelas.atual.inicio,
      fimAtual: janelas.atual.fim,
      inicioAnterior: janelas.anterior.inicio,
      fimAnterior: janelas.anterior.fim,
    };

    const [pedidos, pagamentos, vendasPorDia] = await Promise.all([
      this.resumoDePedidos(parametros),
      this.resumoDePagamentos(parametros),
      this.vendasPorDia(janelas, parametros),
    ]);

    return {
      periodo,
      fuso: FUSO_DA_LOJA,
      janela: {
        inicio: janelas.atual.inicio.toISOString(),
        fim: janelas.atual.fim.toISOString(),
      },
      resumo: {
        faturamentoEmCentavos: {
          atual: pedidos.faturamentoAtual,
          anterior: pedidos.faturamentoAnterior,
        },
        pedidos: {
          atual: pedidos.pedidosAtual,
          anterior: pedidos.pedidosAnterior,
        },
        ticketMedioEmCentavos: {
          atual: ticketMedio(pedidos.faturamentoAtual, pedidos.faturadosAtual),
          anterior: ticketMedio(
            pedidos.faturamentoAnterior,
            pedidos.faturadosAnterior,
          ),
        },
        taxaDeRecusa: {
          atual: taxa(pagamentos.recusadosAtual, pagamentos.concluidosAtual),
          anterior: taxa(
            pagamentos.recusadosAnterior,
            pagamentos.concluidosAnterior,
          ),
        },
      },
      vendasPorDia,
    };
  }

  private async resumoDePedidos(parametros: Record<string, Date>) {
    const linha = await this.pedidos
      .createQueryBuilder('pedido')
      .select(
        `COALESCE(SUM("pedido"."totalInCents") FILTER (WHERE ${DENTRO_DA_ATUAL} AND ${FATURADO}), 0)`,
        'faturamentoAtual',
      )
      .addSelect(
        `COALESCE(SUM("pedido"."totalInCents") FILTER (WHERE ${DENTRO_DA_ANTERIOR} AND ${FATURADO}), 0)`,
        'faturamentoAnterior',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE ${DENTRO_DA_ATUAL} AND ${FATURADO})`,
        'faturadosAtual',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE ${DENTRO_DA_ANTERIOR} AND ${FATURADO})`,
        'faturadosAnterior',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE ${DENTRO_DA_ATUAL} AND ${NAO_CANCELADO})`,
        'pedidosAtual',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE ${DENTRO_DA_ANTERIOR} AND ${NAO_CANCELADO})`,
        'pedidosAnterior',
      )
      .where(`(${DENTRO_DA_ATUAL}) OR (${DENTRO_DA_ANTERIOR})`)
      .setParameters({
        ...parametros,
        faturadas: SITUACOES_FATURADAS,
        cancelado: SituacaoDoPedido.CANCELADO,
      })
      .getRawOne<Linha>();

    return {
      faturamentoAtual: inteiro(linha?.faturamentoAtual),
      faturamentoAnterior: inteiro(linha?.faturamentoAnterior),
      faturadosAtual: inteiro(linha?.faturadosAtual),
      faturadosAnterior: inteiro(linha?.faturadosAnterior),
      pedidosAtual: inteiro(linha?.pedidosAtual),
      pedidosAnterior: inteiro(linha?.pedidosAnterior),
    };
  }

  private async resumoDePagamentos(parametros: Record<string, Date>) {
    const linha = await this.pagamentos
      .createQueryBuilder('pagamento')
      .select(
        `COUNT(*) FILTER (WHERE ${PAGAMENTO_NA_ATUAL} AND "pagamento"."status" = :recusado)`,
        'recusadosAtual',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE ${PAGAMENTO_NA_ANTERIOR} AND "pagamento"."status" = :recusado)`,
        'recusadosAnterior',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE ${PAGAMENTO_NA_ATUAL} AND "pagamento"."status" IN (:...concluidos))`,
        'concluidosAtual',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE ${PAGAMENTO_NA_ANTERIOR} AND "pagamento"."status" IN (:...concluidos))`,
        'concluidosAnterior',
      )
      .where(`(${PAGAMENTO_NA_ATUAL}) OR (${PAGAMENTO_NA_ANTERIOR})`)
      .setParameters({
        ...parametros,
        recusado: SituacaoDoPagamento.RECUSADO,
        concluidos: [
          SituacaoDoPagamento.APROVADO,
          SituacaoDoPagamento.RECUSADO,
        ],
      })
      .getRawOne<Linha>();

    return {
      recusadosAtual: inteiro(linha?.recusadosAtual),
      recusadosAnterior: inteiro(linha?.recusadosAnterior),
      concluidosAtual: inteiro(linha?.concluidosAtual),
      concluidosAnterior: inteiro(linha?.concluidosAnterior),
    };
  }

  private async vendasPorDia(
    janelas: Janelas,
    parametros: Record<string, Date>,
  ): Promise<VendasDoDia[]> {
    const linhas = await this.pedidos
      .createQueryBuilder('pedido')
      .select(
        `to_char(${INSTANTE_DO_PEDIDO} AT TIME ZONE :fuso, 'YYYY-MM-DD')`,
        'dia',
      )
      .addSelect(`SUM("pedido"."totalInCents")`, 'faturamento')
      .addSelect('COUNT(*)', 'pedidos')
      .where(DENTRO_DA_ATUAL)
      .andWhere(FATURADO)
      .groupBy('dia')
      .setParameters({
        ...parametros,
        fuso: FUSO_DA_LOJA,
        faturadas: SITUACOES_FATURADAS,
      })
      .getRawMany<Linha>();

    const porDia = new Map(
      linhas.map((linha) => [
        String(linha.dia),
        {
          faturamentoEmCentavos: inteiro(linha.faturamento),
          pedidos: inteiro(linha.pedidos),
        },
      ]),
    );

    return janelas.dias.map((dia) => ({
      dia,
      ...(porDia.get(dia) ?? { faturamentoEmCentavos: 0, pedidos: 0 }),
    }));
  }
}

// ---------------------------------------------
// Conversão de agregados
// SUM e COUNT voltam como bigint, que o driver pg entrega em string. Um
// valor fora do inteiro seguro do JavaScript seria arredondado em silêncio,
// então a conversão falha alto em vez de devolver número errado.
// ---------------------------------------------
function inteiro(valor: string | number | null | undefined): number {
  const numero = Number(valor ?? 0);
  if (!Number.isSafeInteger(numero)) {
    throw new Error('Agregado de métricas fora do intervalo seguro.');
  }
  return numero;
}

function ticketMedio(faturamento: number, faturados: number): number {
  return faturados === 0 ? 0 : Math.round(faturamento / faturados);
}

function taxa(recusados: number, concluidos: number): number | null {
  return concluidos === 0 ? null : recusados / concluidos;
}
