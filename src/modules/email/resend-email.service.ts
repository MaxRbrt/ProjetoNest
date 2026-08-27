import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthEmailInput, AuthEmailService } from './email.service';
import { RESEND_CLIENT } from './resend-client';
import type { ResendClient } from './resend-client';

const EMAIL_UNAVAILABLE = 'Não foi possível enviar o email agora.';

@Injectable()
export class ResendEmailService extends AuthEmailService {
  private readonly from: string;
  private readonly frontendUrl: string;

  constructor(
    @Inject(RESEND_CLIENT) private readonly resend: ResendClient,
    config: ConfigService,
  ) {
    super();
    this.from = config.getOrThrow<string>('EMAIL_FROM');
    this.frontendUrl = config
      .getOrThrow<string>('FRONTEND_URL')
      .replace(/\/$/, '');
  }

  // ---------------------------------------------
  // Envio de verificação de email
  // ---------------------------------------------
  sendEmailVerification(input: AuthEmailInput): Promise<void> {
    return this.send(
      input,
      'Confirme seu email',
      'verify-email',
      'verify-email',
      'Confirmar email',
    );
  }

  // ---------------------------------------------
  // Envio de recuperação de senha
  // ---------------------------------------------
  sendPasswordReset(input: AuthEmailInput): Promise<void> {
    return this.send(
      input,
      'Redefina sua senha',
      'reset-password',
      'reset-password',
      'Redefinir senha',
    );
  }

  // ---------------------------------------------
  // Montagem e envio idempotente
  // ---------------------------------------------
  private async send(
    input: AuthEmailInput,
    subject: string,
    path: string,
    idempotencyPrefix: string,
    linkText: string,
  ): Promise<void> {
    // O fragmento fica no navegador e não é enviado pelo HTTP ao servidor que
    // entrega a página, reduzindo a exposição do token em logs de acesso.
    const url = `${this.frontendUrl}/${path}#token=${encodeURIComponent(input.rawToken)}`;

    try {
      const result = await this.resend.emails.send(
        {
          from: this.from,
          to: input.recipient,
          subject,
          html: `<p><a href="${url}">${linkText}</a></p>`,
        },
        {
          // Repetir a mesma ação após uma falha transitória não deve gerar
          // múltiplos emails para o usuário.
          idempotencyKey: `${idempotencyPrefix}/${input.actionTokenId}`,
        },
      );

      if (result.error) {
        throw new ServiceUnavailableException(EMAIL_UNAVAILABLE);
      }
    } catch {
      throw new ServiceUnavailableException(EMAIL_UNAVAILABLE);
    }
  }
}
