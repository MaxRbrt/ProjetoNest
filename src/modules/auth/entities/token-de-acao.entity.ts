import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Usuario } from '../../usuarios/usuario.entity';

export enum TipoDeTokenDeAcao {
  EMAIL_VERIFICATION = 'EMAIL_VERIFICATION',
  PASSWORD_RESET = 'PASSWORD_RESET',
}

@Entity('auth_action_tokens')
@Index('UQ_auth_action_tokens_token_hash', ['hashDoToken'], { unique: true })
@Index('IDX_auth_action_tokens_user_type', ['usuarioId', 'tipo'])
@Check(
  'CHK_auth_action_tokens_type',
  `"type" IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET')`,
)
export class TokenDeAcao {
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
  // Finalidade e segredo persistido
  // ---------------------------------------------
  @Column({ type: 'varchar', length: 32, name: 'type' })
  tipo: TipoDeTokenDeAcao;

  @Column({ type: 'char', length: 64, select: false, name: 'tokenHash' })
  hashDoToken: string;

  // ---------------------------------------------
  // Validade, consumo e auditoria
  // ---------------------------------------------
  @Column({ type: 'timestamptz', name: 'expiresAt' })
  expiraEm: Date;

  @Column({ type: 'timestamptz', nullable: true, name: 'usedAt' })
  usadoEm: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'createdAt' })
  criadoEm: Date;
}
