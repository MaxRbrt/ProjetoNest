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
// ---------------------------------------------
export function createResendClient(config: ConfigService): ResendClient {
  return new Resend(config.getOrThrow<string>('RESEND_API_KEY'));
}
