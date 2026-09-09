import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

// ---------------------------------------------
// Atualização parcial de produto
// Preço em centavos inteiros pelo mesmo motivo de CriarProdutoDto.
// ---------------------------------------------
export class AtualizarProdutoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nome?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  precoEmCentavos?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  categoriaId?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  estoque?: number;
}
