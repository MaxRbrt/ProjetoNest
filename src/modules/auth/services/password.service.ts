import { BadRequestException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { exigenciasNaoCumpridas } from '../password-policy';
import { PwnedPasswordsService } from './pwned-passwords.service';

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$Zml4ZWQtZHVtbXktc2FsdA$OEsr1bctQvHD4IruEZSbzLr2CcKWA8MAkVBCAl3p5PI';

@Injectable()
export class PasswordService {
  constructor(private readonly pwnedPasswords: PwnedPasswordsService) {}

  // ---------------------------------------------
  // Validação e derivação de senha
  // A política é reavaliada aqui, e não só no DTO: este serviço também é
  // chamado por fluxos que não passam por requisição HTTP, e confiar apenas
  // na validação de entrada deixaria uma porta sem tranca. A regra vem do
  // mesmo módulo usado pelos DTOs, para que os dois nunca divirjam.
  // ---------------------------------------------
  async hash(password: string): Promise<string> {
    const faltas = exigenciasNaoCumpridas(password);
    if (faltas.length > 0) {
      throw new BadRequestException(`A senha precisa ${faltas.join(', ')}.`);
    }

    if (await this.pwnedPasswords.isCompromised(password)) {
      throw new BadRequestException(
        'Escolha uma senha que não apareça em vazamentos conhecidos.',
      );
    }

    return argon2.hash(password, ARGON2_OPTIONS);
  }

  // ---------------------------------------------
  // Verificação de credencial
  // ---------------------------------------------
  verify(passwordHash: string, password: string): Promise<boolean> {
    return argon2.verify(passwordHash, password);
  }

  // ---------------------------------------------
  // Proteção temporal para conta inexistente
  // ---------------------------------------------
  verifyDummy(password: string): Promise<boolean> {
    return argon2.verify(DUMMY_PASSWORD_HASH, password);
  }
}
