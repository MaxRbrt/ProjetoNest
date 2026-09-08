import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailDeAutenticacaoService } from './email-de-autenticacao.service';
import { ArquivoEmailService } from './arquivo-email.service';
import { RESEND_CLIENT, criarClienteResend } from './cliente-resend';
import type { ResendClient } from './cliente-resend';
import { ResendEmailService } from './resend-email.service';

// ---------------------------------------------
// Composição do módulo de email
// A escolha do provedor é uma fábrica, não um useClass, porque depende de
// EMAIL_PROVIDER lido em tempo de execução. Quem consome continua injetando
// EmailDeAutenticacaoService e não sabe qual implementação recebeu — trocar o transporte
// não toca em nenhum fluxo de autenticação.
// ---------------------------------------------
@Module({
  providers: [
    {
      provide: RESEND_CLIENT,
      inject: [ConfigService],
      useFactory: criarClienteResend,
    },
    {
      provide: EmailDeAutenticacaoService,
      inject: [ConfigService, RESEND_CLIENT],
      useFactory: (
        config: ConfigService,
        resend: ResendClient | null,
      ): EmailDeAutenticacaoService =>
        resend
          ? new ResendEmailService(resend, config)
          : new ArquivoEmailService(config),
    },
  ],
  exports: [EmailDeAutenticacaoService],
})
export class EmailModule {}
