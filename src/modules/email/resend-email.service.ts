import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailMontado,
  montarRecuperacaoDeSenha,
  montarVerificacaoDeEmail,
} from './conteudo-do-email';
import {
  AuthEmailInput,
  EmailDeAutenticacaoService,
} from './email-de-autenticacao.service';
import { RESEND_CLIENT } from './cliente-resend';
import type { ResendClient } from './cliente-resend';

const EMAIL_UNAVAILABLE = 'Não foi possível enviar o email agora.';

@Injectable()
export class ResendEmailService extends EmailDeAutenticacaoService {
  private readonly logger = new Logger(ResendEmailService.name);
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
  enviarVerificacaoDeEmail(input: AuthEmailInput): Promise<void> {
    return this.enviar(
      input,
      montarVerificacaoDeEmail(input, this.frontendUrl),
    );
  }

  // ---------------------------------------------
  // Envio de recuperação de senha
  // ---------------------------------------------
  enviarRedefinicaoDeSenha(input: AuthEmailInput): Promise<void> {
    return this.enviar(
      input,
      montarRecuperacaoDeSenha(input, this.frontendUrl),
    );
  }

  // ---------------------------------------------
  // Entrega pela API do Resend
  // A resposta ao usuário é sempre a mesma mensagem genérica — o motivo real
  // da falha é infraestrutura e não interessa a quem chamou —, mas ele precisa
  // aparecer no log: sem isso, uma rejeição de política (domínio de teste,
  // chave revogada, cota estourada) chega indistinguível de uma queda de rede,
  // e só se descobre escrevendo um script de diagnóstico à parte. O log recebe
  // nome e mensagem do erro; nunca a chave, o token ou o link.
  // ---------------------------------------------
  private async enviar(
    input: AuthEmailInput,
    email: EmailMontado,
  ): Promise<void> {
    let resultado: Awaited<ReturnType<ResendClient['emails']['send']>>;

    try {
      resultado = await this.resend.emails.send(
        {
          from: this.from,
          to: input.recipient,
          subject: email.subject,
          html: email.html,
        },
        { idempotencyKey: email.idempotencyKey },
      );
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      this.logger.error(
        `Falha ao chamar o Resend (${email.subject}): ${motivo}`,
      );
      throw new ServiceUnavailableException(EMAIL_UNAVAILABLE);
    }

    if (resultado.error) {
      this.logger.error(
        `Resend recusou o envio (${email.subject}): ` +
          `${resultado.error.name} — ${resultado.error.message}`,
      );
      throw new ServiceUnavailableException(EMAIL_UNAVAILABLE);
    }
  }
}
