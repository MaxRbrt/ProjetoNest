import { ApiProperty } from '@nestjs/swagger';
import { PERIODOS, type Periodo } from '../janela-de-periodo';

// ---------------------------------------------
// Resposta do dashboard administrativo
// Só números: nenhum dado pessoal (e-mail, endereço, id de usuário) sai
// daqui. Valores monetários em centavos inteiros, como no resto da API.
// "anterior" é o mesmo trecho do ciclo deslocado N dias para trás; a
// variação percentual é calculada por quem consome.
// ---------------------------------------------
export class ComparacaoDeInteiro {
  @ApiProperty({ example: 128990 })
  atual: number;

  @ApiProperty({ example: 99000 })
  anterior: number;
}

export class ComparacaoDeTaxa {
  @ApiProperty({ type: Number, nullable: true, example: 0.125 })
  atual: number | null;

  @ApiProperty({ type: Number, nullable: true, example: null })
  anterior: number | null;
}

export class JanelaDasMetricas {
  @ApiProperty({ example: '2026-09-10T03:00:00.000Z' })
  inicio: string;

  @ApiProperty({ example: '2026-09-16T17:00:00.000Z' })
  fim: string;
}

export class ResumoDasMetricas {
  @ApiProperty({ type: ComparacaoDeInteiro })
  faturamentoEmCentavos: ComparacaoDeInteiro;

  @ApiProperty({ type: ComparacaoDeInteiro })
  pedidos: ComparacaoDeInteiro;

  @ApiProperty({ type: ComparacaoDeInteiro })
  ticketMedioEmCentavos: ComparacaoDeInteiro;

  @ApiProperty({ type: ComparacaoDeTaxa })
  taxaDeRecusa: ComparacaoDeTaxa;
}

export class VendasDoDia {
  @ApiProperty({ example: '2026-09-11' })
  dia: string;

  @ApiProperty({ example: 25980 })
  faturamentoEmCentavos: number;

  @ApiProperty({ example: 2 })
  pedidos: number;
}

export class MetricasDoPainel {
  @ApiProperty({ enum: PERIODOS, example: '7d' })
  periodo: Periodo;

  @ApiProperty({ example: 'America/Sao_Paulo' })
  fuso: string;

  @ApiProperty({ type: JanelaDasMetricas })
  janela: JanelaDasMetricas;

  @ApiProperty({ type: ResumoDasMetricas })
  resumo: ResumoDasMetricas;

  @ApiProperty({ type: [VendasDoDia] })
  vendasPorDia: VendasDoDia[];
}
