import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

export class AtualizarProdutoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nome?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  preco?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  categoriaId?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  estoque?: number;
}
