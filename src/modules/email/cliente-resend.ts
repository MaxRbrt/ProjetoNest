import { ConfigService } from '@nestjs/config';
import { CreateEmailOptions, CreateEmailRequestOptions, Resend } from 'resend';

export const RESEND_CLIENT = Symbol('RESEND_CLIENT');

export interface ResendClient {
  emails: {
    send(
      payload: CreateEmailOptions,
      options?: CreateEmailRequestOptions,
    ): ReturnType<Resend['emails']['send']>;
  };
}

// ---------------------------------------------
// Criação do cliente de email
// Devolve null quando o provedor configurado é o de arquivo: sem isso, o
// getOrThrow da chave derrubaria o boot em desenvolvimento por falta de uma
// credencial que aquele provedor nunca usa.
// ---------------------------------------------
export function criarClienteResend(config: ConfigService): ResendClient | null {
  if (config.getOrThrow<string>('EMAIL_PROVIDER') !== 'resend') {
    return null;
  }
  return new Resend(config.getOrThrow<string>('RESEND_API_KEY'));
}
