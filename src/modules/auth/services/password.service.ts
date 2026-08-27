import { BadRequestException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
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

  async hash(password: string): Promise<string> {
    const length = Array.from(password).length;
    if (length < 15 || length > 128) {
      throw new BadRequestException(
        'A senha deve ter entre 15 e 128 caracteres.',
      );
    }

    if (await this.pwnedPasswords.isCompromised(password)) {
      throw new BadRequestException(
        'Escolha uma senha que não apareça em vazamentos conhecidos.',
      );
    }

    return argon2.hash(password, ARGON2_OPTIONS);
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return argon2.verify(passwordHash, password);
  }

  verifyDummy(password: string): Promise<boolean> {
    return argon2.verify(DUMMY_PASSWORD_HASH, password);
  }
}
