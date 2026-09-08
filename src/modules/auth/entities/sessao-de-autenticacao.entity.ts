import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Usuario } from '../../usuarios/usuario.entity';

@Entity('auth_sessions')
@Index('IDX_auth_sessions_user_id', ['usuarioId'])
@Index('IDX_auth_sessions_active_user', ['usuarioId'], {
  where: '"revokedAt" IS NULL',
})
export class SessaoDeAutenticacao {
  // ---------------------------------------------
  // Identidade e vínculo com o usuário
  // ---------------------------------------------
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'userId' })
  usuarioId: string;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  usuario: Usuario;

  // ---------------------------------------------
  // Validade e revogação da sessão
  // ---------------------------------------------
  @Column({ type: 'timestamptz', name: 'expiresAt' })
  expiraEm: Date;

  @Column({ type: 'timestamptz', nullable: true, name: 'revokedAt' })
  revogadoEm: Date | null;

  // ---------------------------------------------
  // Criação e atividade da sessão
  // ---------------------------------------------
  @CreateDateColumn({ type: 'timestamptz', name: 'createdAt' })
  criadoEm: Date;

  @Column({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    name: 'lastUsedAt',
  })
  usadaPelaUltimaVezEm: Date;
}
