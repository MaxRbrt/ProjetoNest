import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum Papel {
  ADMIN = 'ADMIN',
  CLIENTE = 'CLIENTE',
}

@Entity('users')
@Index('UQ_users_email', ['email'], { unique: true })
@Check('CHK_users_failed_login_attempts', '"failedLoginAttempts" >= 0')
@Check('CHK_users_email_normalized', '"email" = lower(btrim("email"))')
export class Usuario {
  // ---------------------------------------------
  // Identidade e credencial
  // ---------------------------------------------
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 254 })
  email: string;

  @Column({ type: 'text', select: false, name: 'passwordHash' })
  hashDaSenha: string;

  // ---------------------------------------------
  // Papel de acesso
  // O papel vem da persistência, nunca do corpo da requisição: CadastrarDto não
  // declara o campo e o ValidationPipe global rejeita propriedade não declarada.
  // A promoção a ADMIN exige um fluxo administrativo controlado.
  // ---------------------------------------------
  @Column({ type: 'enum', enum: Papel, default: Papel.CLIENTE, name: 'role' })
  papel: Papel;

  // ---------------------------------------------
  // Verificação e bloqueio da conta
  // ---------------------------------------------
  @Column({ type: 'timestamptz', nullable: true, name: 'emailVerifiedAt' })
  emailVerificadoEm: Date | null;

  @Column({ type: 'integer', default: 0, name: 'failedLoginAttempts' })
  tentativasDeLoginFalhas: number;

  @Column({ type: 'timestamptz', nullable: true, name: 'lockedUntil' })
  bloqueadoAte: Date | null;

  // ---------------------------------------------
  // Auditoria temporal
  // ---------------------------------------------
  @CreateDateColumn({ type: 'timestamptz', name: 'createdAt' })
  criadoEm: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updatedAt' })
  atualizadoEm: Date;
}
