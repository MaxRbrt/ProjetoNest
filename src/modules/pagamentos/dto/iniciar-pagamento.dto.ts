import { Matches } from 'class-validator';

// ---------------------------------------------
// Início de pagamento
// 16 dígitos, sem espaço nem hífen — a máscara de exibição é problema da
// interface. Só o número entra aqui: nunca CVV nem validade, porque este
// provedor é simulado e não precisa fingir guardar dado de cartão de verdade.
// ---------------------------------------------
export class IniciarPagamentoDto {
  @Matches(/^\d{16}$/, { message: 'Número de cartão precisa ter 16 dígitos.' })
  numeroDoCartao: string;
}
