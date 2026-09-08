import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SessaoDeAutenticacao } from './sessao-de-autenticacao.entity';

@Entity('refresh_tokens')
@Index('UQ_refresh_tokens_token_hash', ['hashDoToken'], { unique: true })
@Index('IDX_refresh_tokens_session_id', ['sessaoId'])
export class TokenDeRenovacao {
  // ---------------------------------------------
  // Identidade e vínculo com a sessão
  // ---------------------------------------------
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'sessionId' })
  sessaoId: string;

  @ManyToOne(() => SessaoDeAutenticacao, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sessionId' })
  sessao: SessaoDeAutenticacao;

  // ---------------------------------------------
  // Segredo persistido e validade
  // ---------------------------------------------
  @Column({ type: 'char', length: 64, select: false, name: 'tokenHash' })
  hashDoToken: string;

  @Column({ type: 'timestamptz', name: 'expiresAt' })
  expiraEm: Date;

  // ---------------------------------------------
  // Consumo, revogação e cadeia de rotação
  // ---------------------------------------------
  @Column({ type: 'timestamptz', nullable: true, name: 'usedAt' })
  usadoEm: Date | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'revokedAt' })
  revogadoEm: Date | null;

  @Column({ type: 'uuid', nullable: true, name: 'replacedByTokenId' })
  substituidoPeloTokenId: string | null;

  @ManyToOne(() => TokenDeRenovacao, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'replacedByTokenId' })
  substituidoPeloToken: TokenDeRenovacao | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'createdAt' })
  criadoEm: Date;
}
