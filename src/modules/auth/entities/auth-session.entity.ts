import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../usuarios/user.entity';

@Entity('auth_sessions')
@Index('IDX_auth_sessions_user_id', ['userId'])
@Index('IDX_auth_sessions_active_user', ['userId'], {
  where: '"revokedAt" IS NULL',
})
export class AuthSession {
  // ---------------------------------------------
  // Identidade e vínculo com o usuário
  // ---------------------------------------------
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // ---------------------------------------------
  // Validade e revogação da sessão
  // ---------------------------------------------
  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  // ---------------------------------------------
  // Criação e atividade da sessão
  // ---------------------------------------------
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  lastUsedAt: Date;
}
