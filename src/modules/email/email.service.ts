export interface AuthEmailInput {
  recipient: string;
  rawToken: string;
  actionTokenId: string;
}

export abstract class AuthEmailService {
  // ---------------------------------------------
  // Verificação de email
  // ---------------------------------------------
  abstract sendEmailVerification(input: AuthEmailInput): Promise<void>;

  // ---------------------------------------------
  // Recuperação de senha
  // ---------------------------------------------
  abstract sendPasswordReset(input: AuthEmailInput): Promise<void>;
}
