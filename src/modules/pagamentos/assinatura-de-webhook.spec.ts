import {
  assinarEvento,
  eventoDentroDaJanela,
  JANELA_DE_REPLAY_MS,
  verificarAssinatura,
  type EventoDePagamento,
} from './assinatura-de-webhook';

const SEGREDO = 'segredo-de-teste-com-32-bytes-no-minimo!';

function eventoDeExemplo(sobrescreve: Partial<EventoDePagamento> = {}): EventoDePagamento {
  return {
    eventId: '11111111-1111-4111-8111-111111111111',
    pagamentoId: 1,
    pedidoId: 1,
    status: 'APROVADO',
    timestamp: Date.now(),
    ...sobrescreve,
  };
}

// ---------------------------------------------
// Assinatura do webhook de pagamento
// Dois casos merecem explicação por não serem óbvios pelo nome. O de campo
// alterado simula o ataque real: trocar RECUSADO por APROVADO mantendo a
// assinatura do evento original. O de tamanho diferente existe porque
// timingSafeEqual lança para buffers de tamanhos distintos — a função
// precisa blindar isso, não deixar vazar como erro 500.
// ---------------------------------------------
describe('assinarEvento / verificarAssinatura', () => {
  it('assinatura correta é aceita', () => {
    const evento = eventoDeExemplo();
    const assinatura = assinarEvento(evento, SEGREDO);
    expect(verificarAssinatura(evento, assinatura, SEGREDO)).toBe(true);
  });

  it('rejeita quando qualquer campo do evento muda depois de assinado', () => {
    const evento = eventoDeExemplo();
    const assinatura = assinarEvento(evento, SEGREDO);

    const eventoAdulterado = { ...evento, status: 'APROVADO' as const };
    const eventoOriginalRecusado = { ...evento, status: 'RECUSADO' as const };
    const assinaturaDoRecusado = assinarEvento(eventoOriginalRecusado, SEGREDO);

    expect(verificarAssinatura(eventoAdulterado, assinaturaDoRecusado, SEGREDO)).toBe(
      false,
    );
  });

  it('rejeita assinatura de segredo diferente (chave errada)', () => {
    const evento = eventoDeExemplo();
    const assinatura = assinarEvento(evento, 'outro-segredo-completamente-diferente!!');
    expect(verificarAssinatura(evento, assinatura, SEGREDO)).toBe(false);
  });

  it('rejeita assinatura vazia sem lançar exceção', () => {
    const evento = eventoDeExemplo();
    expect(() => verificarAssinatura(evento, '', SEGREDO)).not.toThrow();
    expect(verificarAssinatura(evento, '', SEGREDO)).toBe(false);
  });

  it('rejeita assinatura de tamanho diferente sem lançar exceção', () => {
    const evento = eventoDeExemplo();
    expect(() =>
      verificarAssinatura(evento, 'assinatura-curta-de-mentira', SEGREDO),
    ).not.toThrow();
    expect(verificarAssinatura(evento, 'assinatura-curta-de-mentira', SEGREDO)).toBe(
      false,
    );
  });

  it('duas assinaturas do mesmo evento com o mesmo segredo são idênticas (determinístico)', () => {
    const evento = eventoDeExemplo();
    expect(assinarEvento(evento, SEGREDO)).toBe(assinarEvento(evento, SEGREDO));
  });
});

describe('eventoDentroDaJanela', () => {
  it('aceita evento recente', () => {
    const evento = eventoDeExemplo({ timestamp: Date.now() });
    expect(eventoDentroDaJanela(evento, Date.now())).toBe(true);
  });

  it('rejeita evento mais velho que a janela de replay', () => {
    const evento = eventoDeExemplo({
      timestamp: Date.now() - JANELA_DE_REPLAY_MS - 1000,
    });
    expect(eventoDentroDaJanela(evento, Date.now())).toBe(false);
  });

  it('rejeita evento "do futuro" além da janela (relógio adulterado ou bug)', () => {
    const evento = eventoDeExemplo({
      timestamp: Date.now() + JANELA_DE_REPLAY_MS + 1000,
    });
    expect(eventoDentroDaJanela(evento, Date.now())).toBe(false);
  });

  it('aceita exatamente na borda da janela', () => {
    const agora = Date.now();
    const evento = eventoDeExemplo({ timestamp: agora - JANELA_DE_REPLAY_MS });
    expect(eventoDentroDaJanela(evento, agora)).toBe(true);
  });
});
