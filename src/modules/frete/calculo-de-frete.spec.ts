import {
  calcularOpcaoDeFrete,
  calcularOpcoesDeFrete,
} from './calculo-de-frete';

// ---------------------------------------------
// Cálculo de frete
// Função pura, testada isolada do banco — a integração com endereço e pedido
// já tem cobertura em test/integracao/pedidos-endereco.int-spec.ts.
// ---------------------------------------------
describe('calcularOpcoesDeFrete', () => {
  it('devolve PAC e SEDEX, SEDEX sempre mais caro e mais rápido que PAC', () => {
    const opcoes = calcularOpcoesDeFrete('SP', 1);
    const pac = opcoes.find((o) => o.modalidade === 'PAC')!;
    const sedex = opcoes.find((o) => o.modalidade === 'SEDEX')!;

    expect(pac).toBeDefined();
    expect(sedex).toBeDefined();
    expect(sedex.custoEmCentavos).toBeGreaterThan(pac.custoEmCentavos);
    expect(sedex.prazoEmDiasUteis).toBeLessThan(pac.prazoEmDiasUteis);
  });

  it('é determinístico: mesma UF e quantidade sempre devolvem o mesmo valor', () => {
    const primeira = calcularOpcoesDeFrete('SP', 3);
    const segunda = calcularOpcoesDeFrete('SP', 3);
    expect(primeira).toEqual(segunda);
  });

  it('região mais distante custa mais que a de referência (Sudeste)', () => {
    const [sudeste] = calcularOpcoesDeFrete('SP', 1);
    const [norte] = calcularOpcoesDeFrete('AM', 1);
    expect(norte.custoEmCentavos).toBeGreaterThan(sudeste.custoEmCentavos);
  });

  it('mais itens custam mais, mesma UF e modalidade', () => {
    const [umItem] = calcularOpcoesDeFrete('SP', 1);
    const [cincoItens] = calcularOpcoesDeFrete('SP', 5);
    expect(cincoItens.custoEmCentavos).toBeGreaterThan(umItem.custoEmCentavos);
  });

  it('lança para UF sem região cadastrada (guarda contra dado inconsistente)', () => {
    expect(() => calcularOpcoesDeFrete('XX', 1)).toThrow(/região/);
  });
});

describe('calcularOpcaoDeFrete', () => {
  it('devolve só a modalidade pedida', () => {
    const opcao = calcularOpcaoDeFrete('SP', 1, 'SEDEX');
    expect(opcao.modalidade).toBe('SEDEX');
  });

  it('lança para modalidade inexistente (guarda de defesa, DTO já valida antes)', () => {
    expect(() =>
      calcularOpcaoDeFrete('SP', 1, 'MOTOBOY' as never),
    ).toThrow(/[Mm]odalidade/);
  });
});
