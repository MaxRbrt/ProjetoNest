import { createHmac, timingSafeEqual } from 'node:crypto';

// ---------------------------------------------
// Assinatura HMAC do evento de webhook
// A string canônica é construída a partir de CAMPOS validados do evento, não
// do corpo bruto da requisição — dispensa configurar o Nest/Express para
// preservar o raw body só para esta rota. Funciona porque assinante e
// verificador são o mesmo código (provedor simulado): não há um provedor
// externo real ditando o formato de serialização do JSON, então não existe
// ambiguidade de "qual JSON foi realmente assinado" para explorar.
// ---------------------------------------------
export interface EventoDePagamento {
  eventId: string;
  pagamentoId: number;
  pedidoId: number;
  status: 'APROVADO' | 'RECUSADO';
  timestamp: number;
}

function canonicalizar(evento: EventoDePagamento): string {
  return `${evento.eventId}|${evento.pagamentoId}|${evento.pedidoId}|${evento.status}|${evento.timestamp}`;
}

export function assinarEvento(
  evento: EventoDePagamento,
  segredo: string,
): string {
  return createHmac('sha256', segredo)
    .update(canonicalizar(evento), 'utf8')
    .digest('hex');
}

// ---------------------------------------------
// Verificação em tempo constante
// timingSafeEqual lança se os buffers têm tamanhos diferentes, em vez de
// devolver false — uma assinatura forjada de tamanho errado (ou o cabeçalho
// simplesmente ausente/corrompido) não pode virar erro 500 nem, pior,
// escapar por um catch genérico que trate "deu erro" como "está tudo bem".
// A checagem de tamanho vem antes, então o caminho de forjamento mais óbvio
// (mandar uma string vazia ou curta) sempre cai em "assinatura inválida".
// ---------------------------------------------
export function verificarAssinatura(
  evento: EventoDePagamento,
  assinaturaRecebida: string,
  segredo: string,
): boolean {
  const esperada = Buffer.from(assinarEvento(evento, segredo), 'utf8');
  const recebida = Buffer.from(assinaturaRecebida, 'utf8');

  if (esperada.length !== recebida.length) {
    return false;
  }
  return timingSafeEqual(esperada, recebida);
}

// ---------------------------------------------
// Janela de validade contra replay
// Um evento com assinatura válida mas antigo demais é recusado mesmo assim:
// sem isso, um evento de webhook capturado (log vazado, proxy comprometido)
// poderia ser reenviado dias depois e ainda seria aceito como legítimo. O
// timestamp faz parte do conteúdo assinado, então adulterá-lo para "burlar"
// a janela invalidaria a própria assinatura.
// ---------------------------------------------
export const JANELA_DE_REPLAY_MS = 5 * 60 * 1000;

export function eventoDentroDaJanela(
  evento: EventoDePagamento,
  agora: number,
): boolean {
  return Math.abs(agora - evento.timestamp) <= JANELA_DE_REPLAY_MS;
}
