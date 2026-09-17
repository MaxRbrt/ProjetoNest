import { calcularJanelas } from './janela-de-periodo';

// ---------------------------------------------
// Janelas de período do dashboard
// O "dia" é o dia civil de São Paulo (UTC-3), não o dia UTC: às 02:30 UTC
// ainda é o dia anterior para quem opera a loja. O período anterior é o
// atual deslocado N dias para trás: compara o mesmo trecho do ciclo (hoje
// até as 14h contra ontem até as 14h), não uma janela colada ao início.
// ---------------------------------------------
describe('calcularJanelas', () => {
  const agora = new Date('2026-09-16T17:00:00.000Z'); // 14:00 em São Paulo

  it('hoje começa à meia-noite de São Paulo e termina agora', () => {
    const janelas = calcularJanelas('hoje', agora);

    expect(janelas.atual.inicio.toISOString()).toBe('2026-09-16T03:00:00.000Z');
    expect(janelas.atual.fim.toISOString()).toBe('2026-09-16T17:00:00.000Z');
    expect(janelas.dias).toEqual(['2026-09-16']);
  });

  it('o anterior de hoje é ontem da meia-noite até a mesma hora', () => {
    const janelas = calcularJanelas('hoje', agora);

    expect(janelas.anterior.inicio.toISOString()).toBe(
      '2026-09-15T03:00:00.000Z',
    );
    expect(janelas.anterior.fim.toISOString()).toBe('2026-09-15T17:00:00.000Z');
  });

  it('7d cobre sete dias civis contando hoje, em ordem crescente', () => {
    const janelas = calcularJanelas('7d', agora);

    expect(janelas.atual.inicio.toISOString()).toBe('2026-09-10T03:00:00.000Z');
    expect(janelas.dias).toEqual([
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
    ]);
  });

  it('o anterior de 7d são os sete dias antes, até a mesma hora', () => {
    const janelas = calcularJanelas('7d', agora);

    expect(janelas.anterior.inicio.toISOString()).toBe(
      '2026-09-03T03:00:00.000Z',
    );
    expect(janelas.anterior.fim.toISOString()).toBe('2026-09-09T17:00:00.000Z');
  });

  it('30d e 90d devolvem um dia por posição, atravessando a virada de mês', () => {
    const trinta = calcularJanelas('30d', agora);
    const noventa = calcularJanelas('90d', agora);

    expect(trinta.dias).toHaveLength(30);
    expect(trinta.dias[0]).toBe('2026-08-18');
    expect(noventa.dias).toHaveLength(90);
    expect(noventa.dias[0]).toBe('2026-06-19');
    expect(noventa.dias[89]).toBe('2026-09-16');
  });

  it('às 02:30 UTC ainda é o dia anterior em São Paulo', () => {
    const madrugada = new Date('2026-09-16T02:30:00.000Z'); // 23:30 do dia 15

    const janelas = calcularJanelas('hoje', madrugada);

    expect(janelas.dias).toEqual(['2026-09-15']);
    expect(janelas.atual.inicio.toISOString()).toBe('2026-09-15T03:00:00.000Z');
  });
});
