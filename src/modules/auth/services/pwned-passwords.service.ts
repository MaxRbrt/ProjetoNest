import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

const UNAVAILABLE_MESSAGE =
  'A validação de senha está temporariamente indisponível.';

@Injectable()
export class PwnedPasswordsService {
  private readonly apiUrl: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.apiUrl = config.getOrThrow<string>('HIBP_API_URL').replace(/\/$/, '');
    this.timeoutMs = config.getOrThrow<number>('HIBP_TIMEOUT_MS');
  }

  // ---------------------------------------------
  // Consulta de senha em vazamentos conhecidos
  // ---------------------------------------------
  async isCompromised(password: string): Promise<boolean> {
    const sha1 = createHash('sha1')
      .update(password, 'utf8')
      .digest('hex')
      .toUpperCase();
    const prefix = sha1.slice(0, 5);
    const expectedSuffix = sha1.slice(5);

    try {
      // O modelo k-anonymity envia somente o prefixo do hash; a senha e o hash
      // completo nunca saem da aplicação.
      const response = await fetch(`${this.apiUrl}/range/${prefix}`, {
        headers: {
          'Add-Padding': 'true',
          'User-Agent': 'projeto-test-auth/1.0',
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
      }

      const body = await response.text();
      return body.split(/\r?\n/).some((line) => {
        const [suffix, count] = line.trim().split(':', 2);
        return suffix === expectedSuffix && Number(count) > 0;
      });
    } catch {
      // Falha fechada: se a verificação externa não é confiável, o cadastro
      // não prossegue com uma senha possivelmente comprometida.
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }
  }
}
