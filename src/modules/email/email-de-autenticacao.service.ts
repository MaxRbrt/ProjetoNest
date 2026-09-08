export interface AuthEmailInput {
  recipient: string;
  rawToken: string;
  actionTokenId: string;
}

export abstract class EmailDeAutenticacaoService {
  // ---------------------------------------------
  // Verificação de email
  // ---------------------------------------------
  abstract enviarVerificacaoDeEmail(input: AuthEmailInput): Promise<void>;

  // ---------------------------------------------
  // Recuperação de senha
  // ---------------------------------------------
  abstract enviarRedefinicaoDeSenha(input: AuthEmailInput): Promise<void>;
}
