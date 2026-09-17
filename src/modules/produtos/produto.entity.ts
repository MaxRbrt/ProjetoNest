import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Categoria } from '../categorias/categoria.entity';
import { ItemDoPedido } from '../pedidos/entities/item-do-pedido.entity';

// ---------------------------------------------
// Situação do produto
// ATIVO aparece no catálogo público e pode ser comprado. ARQUIVADO some das
// duas coisas sem apagar nada: order_items já congela nome e preço, então
// nenhum pedido antigo depende do produto continuar ATIVO. Arquivar é a
// alternativa a um DELETE que a FK de order_items sempre vai recusar quando
// existir histórico — ver PRODUTOS_COM_HISTORICO_NAO_PODEM_SER_APAGADOS em
// produtos.service.ts.
// ---------------------------------------------
export enum SituacaoDoProduto {
  ATIVO = 'ATIVO',
  ARQUIVADO = 'ARQUIVADO',
}

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

  @Index('IDX_products_status')
  @Column({
    type: 'enum',
    enum: SituacaoDoProduto,
    default: SituacaoDoProduto.ATIVO,
    name: 'status',
  })
  situacao: SituacaoDoProduto;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'imageFileName',
  })
  nomeDoArquivoDaImagem: string | null;

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
