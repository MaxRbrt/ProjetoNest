import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Pedido } from './pedido.entity';
import { Produto } from '../../produtos/produto.entity';

@Entity('order_items')
export class ItemDoPedido {
  // ---------------------------------------------
  // Identificação e quantidade
  // ---------------------------------------------
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'quantity' })
  quantidade: number;

  // ---------------------------------------------
  // Vínculo com o pedido
  // ---------------------------------------------
  @Column({ name: 'orderId' })
  pedidoId: number;

  @ManyToOne(() => Pedido, (pedido) => pedido.itens)
  @JoinColumn({ name: 'orderId' })
  pedido: Pedido;

  // ---------------------------------------------
  // Vínculo com o produto
  // ---------------------------------------------
  @Column({ name: 'productId' })
  produtoId: number;

  @ManyToOne(() => Produto, (produto) => produto.itensDePedido)
  @JoinColumn({ name: 'productId' })
  produto: Produto;

  // ---------------------------------------------
  // Registro histórico da compra
  // Nome e preço unitário são copiados no momento do pedido, não lidos do
  // produto na hora de exibir: o produto muda de preço e de nome com o tempo,
  // e o pedido precisa continuar mostrando o que o cliente de fato comprou e
  // pagou. Também mantém o item legível se o produto for removido depois.
  // ---------------------------------------------
  @Column({ type: 'varchar', length: 255, name: 'productName' })
  nomeDoProduto: string;

  @Column('integer', { name: 'unitPriceInCents' })
  precoUnitarioEmCentavos: number;
}
