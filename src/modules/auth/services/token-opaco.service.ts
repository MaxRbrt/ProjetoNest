import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

export interface OpaqueToken {
  rawToken: string;
  hashDoToken: string;
}

@Injectable()
export class TokenOpacoService {
  // ---------------------------------------------
  // Geração de token opaco
  // ---------------------------------------------
  generate(): OpaqueToken {
    const rawToken = randomBytes(32).toString('base64url');
    return { rawToken, hashDoToken: this.hash(rawToken) };
  }

  // ---------------------------------------------
  // Derivação do valor persistível
  // ---------------------------------------------
  hash(rawToken: string): string {
    return createHash('sha256').update(rawToken, 'utf8').digest('hex');
  }
}
