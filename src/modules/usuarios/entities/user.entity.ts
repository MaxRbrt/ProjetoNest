import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum Role {
  ADMIN = 'ADMIN',
  CLIENTE = 'CLIENTE',
}

@Entity('users')
@Index('UQ_users_email', ['email'], { unique: true })
@Check('CHK_users_failed_login_attempts', '"failedLoginAttempts" >= 0')
@Check('CHK_users_email_normalized', '"email" = lower(btrim("email"))')
export class User {
  // ---------------------------------------------
  // Identidade e credencial
  // ---------------------------------------------
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 254 })
  email: string;

  @Column({ type: 'text', select: false })
  passwordHash: string;

  // ---------------------------------------------
  // Papel de acesso
  // ---------------------------------------------
  // O papel vem da persistência, nunca do corpo da requisição: RegisterDto não
  // declara o campo e o ValidationPipe global rejeita propriedade não declarada.
  // A promoção a ADMIN exige um fluxo administrativo controlado.
  @Column({ type: 'enum', enum: Role, default: Role.CLIENTE })
  role: Role;

  // ---------------------------------------------
  // Verificação e bloqueio da conta
  // ---------------------------------------------
  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ type: 'integer', default: 0 })
  failedLoginAttempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  // ---------------------------------------------
  // Auditoria temporal
  // ---------------------------------------------
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
