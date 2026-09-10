import { decidirPagamento, ultimosDigitos } from './provedor-de-pagamento-simulado';

describe('decidirPagamento', () => {
  it('recusa cartão terminado em 0002 (cartão de teste de recusa)', () => {
    const resultado = decidirPagamento('4000000000000002');
    expect(resultado.resultado).toBe('RECUSADO');
    expect(resultado.motivoDeRecusa).not.toBeNull();
  });

  it('aprova qualquer outro número de 16 dígitos', () => {
    const resultado = decidirPagamento('4111111111111111');
    expect(resultado.resultado).toBe('APROVADO');
    expect(resultado.motivoDeRecusa).toBeNull();
  });

  it('é determinístico: o mesmo cartão sempre dá o mesmo resultado', () => {
    const primeira = decidirPagamento('4111111111111111');
    const segunda = decidirPagamento('4111111111111111');
    expect(primeira).toEqual(segunda);
  });
});

describe('ultimosDigitos', () => {
  it('extrai só os 4 últimos dígitos, nunca o número completo', () => {
    expect(ultimosDigitos('4111111111111111')).toBe('1111');
    expect(ultimosDigitos('4111111111111111')).toHaveLength(4);
  });
});
