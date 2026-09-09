import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Categoria } from '../categorias/categoria.entity';
import { ItemDoPedido } from '../pedidos/entities/item-do-pedido.entity';

// ---------------------------------------------
// Produto do catálogo
// A propriedade está em PT-BR e a coluna continua em inglês, declarada em
// @Column({ name }): o banco já existe com esses nomes, e renomear coluna
// exigiria migration de ALTER TABLE sem ganho nenhum — quem lê o código é
// pessoa, quem lê a coluna é o Postgres.
//
// A exceção é o preço: ali a coluna foi renomeada junto com a propriedade
// (price -> priceInCents) porque o que mudou não foi o idioma, foi a
// unidade. Uma coluna chamada "price" guardando 1990 faria quem consulta o
// banco direto ler mil novecentos e noventa reais.
// ---------------------------------------------
@Entity('products')
export class Produto {
  // ---------------------------------------------
  // Dados comerciais e estoque
  // ---------------------------------------------
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'name' })
  nome: string;

  @Column('integer', { name: 'priceInCents' })
  precoEmCentavos: number;

  @Column({ name: 'stock' })
  estoque: number;

  // ---------------------------------------------
  // Vínculo com a categoria
  // ---------------------------------------------
  @Column({ name: 'categoryId' })
  categoriaId: number;

  @ManyToOne(() => Categoria, (categoria) => categoria.produtos)
  @JoinColumn({ name: 'categoryId' })
  categoria: Categoria;

  // ---------------------------------------------
  // Dependência de itens de pedido
  // ---------------------------------------------
  @OneToMany(() => ItemDoPedido, (item) => item.produto)
  itensDePedido: ItemDoPedido[];
}
