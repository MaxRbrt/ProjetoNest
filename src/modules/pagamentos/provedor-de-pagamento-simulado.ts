// ---------------------------------------------
// Provedor de pagamento — SIMULADO, não é integração real
// Decisão determinística pelo número do cartão, mesmo padrão dos "cartões de
// teste" de provedores reais (o cartão 4000000000000002 do Stripe sempre
// recusa, por exemplo). Terminar em '0002' recusa; qualquer outro número
// válido aprova. Nenhuma rede, nenhuma chamada externa.
// ---------------------------------------------

export type ResultadoDoPagamento = 'APROVADO' | 'RECUSADO';

const SUFIXO_DE_CARTAO_RECUSADO = '0002';

export function decidirPagamento(numeroDoCartao: string): {
  resultado: ResultadoDoPagamento;
  motivoDeRecusa: string | null;
} {
  if (numeroDoCartao.endsWith(SUFIXO_DE_CARTAO_RECUSADO)) {
    return {
      resultado: 'RECUSADO',
      motivoDeRecusa: 'Cartão recusado pela operadora (simulado).',
    };
  }
  return { resultado: 'APROVADO', motivoDeRecusa: null };
}

export function ultimosDigitos(numeroDoCartao: string): string {
  return numeroDoCartao.slice(-4);
}
