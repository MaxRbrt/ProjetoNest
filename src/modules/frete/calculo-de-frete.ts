// ---------------------------------------------
// Cálculo de frete — SIMULADO, não é integração com transportadora
// Determinístico de propósito: mesmo endereço + mesma quantidade de itens
// sempre devolve o mesmo resultado, para o teste (e o cliente) não dependerem
// de sorte. A "distância" é aproximada pela região da UF de destino — não há
// peso, volume nem CEP de origem reais neste modelo.
// ---------------------------------------------

type Regiao = 'NORTE' | 'NORDESTE' | 'CENTRO_OESTE' | 'SUDESTE' | 'SUL';

const REGIAO_POR_UF: Record<string, Regiao> = {
  AC: 'NORTE', AP: 'NORTE', AM: 'NORTE', PA: 'NORTE', RO: 'NORTE',
  RR: 'NORTE', TO: 'NORTE',
  AL: 'NORDESTE', BA: 'NORDESTE', CE: 'NORDESTE', MA: 'NORDESTE',
  PB: 'NORDESTE', PE: 'NORDESTE', PI: 'NORDESTE', RN: 'NORDESTE',
  SE: 'NORDESTE',
  DF: 'CENTRO_OESTE', GO: 'CENTRO_OESTE', MT: 'CENTRO_OESTE', MS: 'CENTRO_OESTE',
  ES: 'SUDESTE', MG: 'SUDESTE', RJ: 'SUDESTE', SP: 'SUDESTE',
  PR: 'SUL', RS: 'SUL', SC: 'SUL',
};

export type ModalidadeDeFrete = 'PAC' | 'SEDEX';

export const MODALIDADES_VALIDAS: readonly ModalidadeDeFrete[] = ['PAC', 'SEDEX'];

interface ParametrosDaModalidade {
  custoBaseEmCentavos: number;
  prazoBaseEmDiasUteis: number;
}

// ---------------------------------------------
// Parâmetros por região e modalidade
// SUDESTE é a referência (menor custo/prazo, concentra o centro de
// distribuição fictício). Quanto mais distante, maior o custo base e o prazo
// — mesma direção em PAC e SEDEX, SEDEX sempre mais caro e mais rápido.
// ---------------------------------------------
const PARAMETROS: Record<Regiao, Record<ModalidadeDeFrete, ParametrosDaModalidade>> = {
  SUDESTE: {
    PAC: { custoBaseEmCentavos: 1500, prazoBaseEmDiasUteis: 5 },
    SEDEX: { custoBaseEmCentavos: 2800, prazoBaseEmDiasUteis: 2 },
  },
  SUL: {
    PAC: { custoBaseEmCentavos: 1800, prazoBaseEmDiasUteis: 6 },
    SEDEX: { custoBaseEmCentavos: 3200, prazoBaseEmDiasUteis: 3 },
  },
  CENTRO_OESTE: {
    PAC: { custoBaseEmCentavos: 2000, prazoBaseEmDiasUteis: 7 },
    SEDEX: { custoBaseEmCentavos: 3600, prazoBaseEmDiasUteis: 3 },
  },
  NORDESTE: {
    PAC: { custoBaseEmCentavos: 2400, prazoBaseEmDiasUteis: 9 },
    SEDEX: { custoBaseEmCentavos: 4200, prazoBaseEmDiasUteis: 4 },
  },
  NORTE: {
    PAC: { custoBaseEmCentavos: 3000, prazoBaseEmDiasUteis: 12 },
    SEDEX: { custoBaseEmCentavos: 5200, prazoBaseEmDiasUteis: 5 },
  },
};

const CUSTO_POR_ITEM_ADICIONAL_EM_CENTAVOS = 150;

export interface OpcaoDeFrete {
  modalidade: ModalidadeDeFrete;
  custoEmCentavos: number;
  prazoEmDiasUteis: number;
}

// ---------------------------------------------
// Cotação de frete para um destino e quantidade de itens
// quantidadeDeItens é a soma das quantidades do carrinho, não o número de
// linhas — 1 produto com quantidade 5 pesa tanto no cálculo quanto 5
// produtos de quantidade 1.
// ---------------------------------------------
export function calcularOpcoesDeFrete(
  uf: string,
  quantidadeDeItens: number,
): OpcaoDeFrete[] {
  const regiao = REGIAO_POR_UF[uf];
  if (!regiao) {
    throw new Error(`UF sem região de frete cadastrada: ${uf}`);
  }

  const itensAdicionais = Math.max(0, quantidadeDeItens - 1);

  return MODALIDADES_VALIDAS.map((modalidade) => {
    const parametros = PARAMETROS[regiao][modalidade];
    return {
      modalidade,
      custoEmCentavos:
        parametros.custoBaseEmCentavos +
        itensAdicionais * CUSTO_POR_ITEM_ADICIONAL_EM_CENTAVOS,
      prazoEmDiasUteis: parametros.prazoBaseEmDiasUteis,
    };
  });
}

// ---------------------------------------------
// Cotação de uma modalidade específica
// Usado na criação do pedido: o servidor recalcula o custo da modalidade
// escolhida a partir do endereço e dos itens, em vez de confiar em qualquer
// valor que o cliente possa enviar. O cliente nunca manda custoEmCentavos —
// só a modalidade — então não existe payload de frete para forjar.
// ---------------------------------------------
export function calcularOpcaoDeFrete(
  uf: string,
  quantidadeDeItens: number,
  modalidade: ModalidadeDeFrete,
): OpcaoDeFrete {
  const opcoes = calcularOpcoesDeFrete(uf, quantidadeDeItens);
  const opcao = opcoes.find((o) => o.modalidade === modalidade);
  if (!opcao) {
    throw new Error(`Modalidade de frete inválida: ${modalidade}`);
  }
  return opcao;
}
