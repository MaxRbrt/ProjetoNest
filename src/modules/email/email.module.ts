import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthEmailService } from './email.service';
import { RESEND_CLIENT, createResendClient } from './resend-client';
import { ResendEmailService } from './resend-email.service';

@Module({
  providers: [
    {
      provide: RESEND_CLIENT,
      inject: [ConfigService],
      useFactory: createResendClient,
    },
    {
      provide: AuthEmailService,
      useClass: ResendEmailService,
    },
  ],
  exports: [AuthEmailService],
})
export class EmailModule {}
