import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Usuario } from '../usuarios/usuario.entity';

// ---------------------------------------------
// Endereço de entrega
// numero é varchar, não integer: endereço real tem "123A", "S/N", "Lote 4".
// cep fica normalizado em 8 dígitos, sem hífen — a máscara é responsabilidade
// da interface, não do dado persistido.
// ---------------------------------------------
@Entity('addresses')
@Index('IDX_addresses_user', ['usuarioId'])
export class Endereco {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uuid', name: 'userId' })
  usuarioId: string;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  usuario: Usuario;

  @Column({ type: 'varchar', length: 60 })
  apelido: string;

  @Column({ type: 'varchar', length: 120 })
  destinatario: string;

  @Column({ type: 'char', length: 8 })
  cep: string;

  @Column({ type: 'varchar', length: 200 })
  logradouro: string;

  @Column({ type: 'varchar', length: 20 })
  numero: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  complemento: string | null;

  @Column({ type: 'varchar', length: 100 })
  bairro: string;

  @Column({ type: 'varchar', length: 100 })
  cidade: string;

  @Column({ type: 'char', length: 2 })
  uf: string;

  // ---------------------------------------------
  // Endereço principal
  // No máximo um por usuário — garantido pelo serviço numa transação, não por
  // constraint de banco: um índice único parcial exigiria excluir o próprio
  // registro na comparação, e a janela entre "desmarcar o antigo" e "marcar o
  // novo" já fica coberta pela transação.
  // ---------------------------------------------
  @Column({ type: 'boolean', default: false })
  principal: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'createdAt' })
  criadoEm: Date;
}
