export interface AuthEmailInput {
  recipient: string;
  rawToken: string;
  actionTokenId: string;
}

export abstract class AuthEmailService {
  abstract sendEmailVerification(input: AuthEmailInput): Promise<void>;
  abstract sendPasswordReset(input: AuthEmailInput): Promise<void>;
}
