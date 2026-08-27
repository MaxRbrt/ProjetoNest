import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuthSession } from './auth-session.entity';

@Entity('refresh_tokens')
@Index('UQ_refresh_tokens_token_hash', ['tokenHash'], { unique: true })
@Index('IDX_refresh_tokens_session_id', ['sessionId'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => AuthSession, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session: AuthSession;

  @Column({ type: 'char', length: 64, select: false })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  replacedByTokenId: string | null;

  @ManyToOne(() => RefreshToken, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'replacedByTokenId' })
  replacedByToken: RefreshToken | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
