export const PERIODOS = ['hoje', '7d', '30d', '90d'] as const;
export type Periodo = (typeof PERIODOS)[number];

export const FUSO_DA_LOJA = 'America/Sao_Paulo';

const DIAS_POR_PERIODO: Record<Periodo, number> = {
  hoje: 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

const UM_DIA_EM_MS = 24 * 60 * 60 * 1000;

export interface Intervalo {
  inicio: Date;
  fim: Date;
}

export interface Janelas {
  atual: Intervalo;
  anterior: Intervalo;
  dias: string[];
}

const PARTES_NO_FUSO = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO_DA_LOJA,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

// ---------------------------------------------
// Janelas de período do dashboard
// O dia é o dia civil de São Paulo. A diferença entre o relógio de São Paulo
// e o UTC é lida do próprio Intl no instante "agora" e aplicada à meia-noite
// do dia: correto enquanto a meia-noite e o agora tiverem o mesmo
// deslocamento — o caso atual, já que São Paulo não tem horário de verão
// desde 2019. O período anterior é o atual deslocado N dias para trás, para
// comparar o mesmo trecho do ciclo (hoje até as 14h contra ontem até as 14h).
// ---------------------------------------------
export function calcularJanelas(periodo: Periodo, agora: Date): Janelas {
  const partes = Object.fromEntries(
    PARTES_NO_FUSO.formatToParts(agora).map((p) => [p.type, p.value]),
  );
  const relogioLocalComoUtc = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    Number(partes.hour),
    Number(partes.minute),
    Number(partes.second),
  );
  const deslocamento =
    relogioLocalComoUtc - Math.floor(agora.getTime() / 1000) * 1000;
  const meiaNoiteLocalComoUtc = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
  );

  const quantidadeDeDias = DIAS_POR_PERIODO[periodo];
  const primeiroDiaComoUtc =
    meiaNoiteLocalComoUtc - (quantidadeDeDias - 1) * UM_DIA_EM_MS;

  const inicio = new Date(primeiroDiaComoUtc - deslocamento);
  const fim = new Date(agora.getTime());
  const deslocamentoDoAnterior = quantidadeDeDias * UM_DIA_EM_MS;

  const dias = Array.from({ length: quantidadeDeDias }, (_, indice) =>
    new Date(primeiroDiaComoUtc + indice * UM_DIA_EM_MS)
      .toISOString()
      .slice(0, 10),
  );

  return {
    atual: { inicio, fim },
    anterior: {
      inicio: new Date(inicio.getTime() - deslocamentoDoAnterior),
      fim: new Date(fim.getTime() - deslocamentoDoAnterior),
    },
    dias,
  };
}
