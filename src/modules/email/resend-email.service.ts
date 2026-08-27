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

  sendEmailVerification(input: AuthEmailInput): Promise<void> {
    return this.send(
      input,
      'Confirme seu email',
      'verify-email',
      'verify-email',
      'Confirmar email',
    );
  }

  sendPasswordReset(input: AuthEmailInput): Promise<void> {
    return this.send(
      input,
      'Redefina sua senha',
      'reset-password',
      'reset-password',
      'Redefinir senha',
    );
  }

  private async send(
    input: AuthEmailInput,
    subject: string,
    path: string,
    idempotencyPrefix: string,
    linkText: string,
  ): Promise<void> {
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
