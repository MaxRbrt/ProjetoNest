import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Produto } from '../produtos/produto.entity';

// ---------------------------------------------
// Categoria do catálogo
// Propriedade em PT-BR, coluna preservada em @Column({ name }) — o banco já
// existe e renomear coluna exigiria migration sem ganho.
// ---------------------------------------------
@Entity('categories')
export class Categoria {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'name' })
  nome: string;

  @OneToMany(() => Produto, (produto) => produto.categoria)
  produtos: Produto[];
}
