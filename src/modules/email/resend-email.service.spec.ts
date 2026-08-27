import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResendEmailService } from './resend-email.service';
import { ResendClient } from './resend-client';

describe('ResendEmailService', () => {
  const send = jest.fn();
  let service: ResendEmailService;

  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({ data: { id: 'email-id' }, error: null });

    const client = { emails: { send } } as unknown as ResendClient;
    const values: Record<string, string> = {
      EMAIL_FROM: 'Marketplace <onboarding@resend.dev>',
      FRONTEND_URL: 'http://localhost:3001/',
    };
    const config = {
      getOrThrow: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;

    service = new ResendEmailService(client, config);
  });

  it('envia verificação com fragmento e idempotency key', async () => {
    await service.sendEmailVerification({
      recipient: 'usuario@example.com',
      rawToken: 'token-seguro',
      actionTokenId: 'action-id',
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Marketplace <onboarding@resend.dev>',
        to: 'usuario@example.com',
        subject: 'Confirme seu email',
        html: expect.stringContaining(
          'http://localhost:3001/verify-email#token=token-seguro',
        ),
      }),
      { idempotencyKey: 'verify-email/action-id' },
    );
  });

  it('envia recuperação de senha com fragmento separado', async () => {
    await service.sendPasswordReset({
      recipient: 'usuario@example.com',
      rawToken: 'outro-token',
      actionTokenId: 'reset-id',
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Redefina sua senha',
        html: expect.stringContaining(
          'http://localhost:3001/reset-password#token=outro-token',
        ),
      }),
      { idempotencyKey: 'reset-password/reset-id' },
    );
  });

  it('converte erro externo em falha sanitizada', async () => {
    send.mockResolvedValue({
      data: null,
      error: {
        name: 'validation_error',
        message: 'detalhe externo',
        statusCode: 422,
      },
    });

    await expect(
      service.sendEmailVerification({
        recipient: 'usuario@example.com',
        rawToken: 'token-seguro',
        actionTokenId: 'action-id',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
