import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

export class CriarProdutoDto {
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsNumber()
  @IsPositive()
  preco: number;

  @IsInt()
  @IsPositive()
  categoriaId: number;

  @IsInt()
  @Min(0)
  estoque: number;
}
