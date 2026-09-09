import { IsInt, IsNotEmpty, IsPositive, IsString, Min } from 'class-validator';

// ---------------------------------------------
// Criação de produto
// O preço chega em centavos inteiros, não em reais fracionários: @IsInt
// rejeita 19.9 na entrada, o que é o ponto — dinheiro em ponto flutuante
// acumula erro de arredondamento e diverge do provedor de pagamento em
// centavo. A conversão de reais para centavos é responsabilidade da
// interface, que é onde a pessoa digita.
// ---------------------------------------------
export class CriarProdutoDto {
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsInt()
  @IsPositive()
  precoEmCentavos: number;

  @IsInt()
  @IsPositive()
  categoriaId: number;

  @IsInt()
  @Min(0)
  estoque: number;
}
