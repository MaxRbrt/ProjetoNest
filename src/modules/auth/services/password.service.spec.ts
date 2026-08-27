import { BadRequestException } from '@nestjs/common';
import { PwnedPasswordsService } from './pwned-passwords.service';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  let compromised: jest.MockedFunction<PwnedPasswordsService['isCompromised']>;
  let service: PasswordService;

  beforeEach(() => {
    compromised = jest.fn().mockResolvedValue(false);
    const pwnedPasswords = {
      isCompromised: compromised,
    } as unknown as PwnedPasswordsService;
    service = new PasswordService(pwnedPasswords);
  });

  it('gera Argon2id com os parâmetros aprovados e valida o hash', async () => {
    const password = 'uma frase-senha segura';
    const passwordHash = await service.hash(password);

    expect(passwordHash).toMatch(/^\$argon2id\$v=19\$/);
    expect(passwordHash).toContain('m=19456');
    expect(passwordHash).toContain('t=2');
    expect(passwordHash).toContain('p=1');
    await expect(service.verify(passwordHash, password)).resolves.toBe(true);
    expect(compromised).toHaveBeenCalledWith(password);
  });

  it('não remove espaços da senha', async () => {
    const password = '  frase senha segura  ';
    const passwordHash = await service.hash(password);

    await expect(service.verify(passwordHash, password)).resolves.toBe(true);
    await expect(service.verify(passwordHash, password.trim())).resolves.toBe(
      false,
    );
  });

  it.each(['a'.repeat(14), 'a'.repeat(129)])(
    'rejeita senha fora de 15 a 128 caracteres',
    async (password) => {
      await expect(service.hash(password)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(compromised).not.toHaveBeenCalled();
    },
  );

  it('conta caracteres Unicode, não unidades UTF-16', async () => {
    const password = '😀'.repeat(15);

    await expect(service.hash(password)).resolves.toMatch(/^\$argon2id\$/);
  });

  it('rejeita senha encontrada no corpus comprometido', async () => {
    compromised.mockResolvedValue(true);

    await expect(service.hash('uma senha comprometida')).rejects.toThrow(
      'Escolha uma senha que não apareça em vazamentos conhecidos.',
    );
  });

  it('executa verificação Argon2 fictícia para contas inexistentes', async () => {
    await expect(service.verifyDummy('qualquer tentativa')).resolves.toBe(
      false,
    );
  });
});
