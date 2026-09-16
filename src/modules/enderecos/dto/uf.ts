// ---------------------------------------------
// Unidades federativas válidas
// Lista fechada em vez de @Length(2,2): "XX" passaria na checagem de tamanho
// e só falharia na hora de calcular frete, bem mais longe da causa.
// ---------------------------------------------
export const UFS_VALIDAS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;

export type Uf = (typeof UFS_VALIDAS)[number];
