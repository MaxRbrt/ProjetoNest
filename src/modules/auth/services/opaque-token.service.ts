import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

export interface OpaqueToken {
  rawToken: string;
  tokenHash: string;
}

@Injectable()
export class OpaqueTokenService {
  generate(): OpaqueToken {
    const rawToken = randomBytes(32).toString('base64url');
    return { rawToken, tokenHash: this.hash(rawToken) };
  }

  hash(rawToken: string): string {
    return createHash('sha256').update(rawToken, 'utf8').digest('hex');
  }
}
