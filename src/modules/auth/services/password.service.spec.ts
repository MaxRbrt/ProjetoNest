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

  // ---------------------------------------------
  // Derivação e preservação da senha
  // ---------------------------------------------
  it('gera Argon2id com os parâmetros aprovados e valida o hash', async () => {
    const password = 'Uma frase-senha segura 1!';
    const passwordHash = await service.hash(password);

    expect(passwordHash).toMatch(/^\$argon2id\$v=19\$/);
    expect(passwordHash).toContain('m=19456');
    expect(passwordHash).toContain('t=2');
    expect(passwordHash).toContain('p=1');
    await expect(service.verify(passwordHash, password)).resolves.toBe(true);
    expect(compromised).toHaveBeenCalledWith(password);
  });

  it('não remove espaços da senha', async () => {
    const password = '  Frase senha segura 1!  ';
    const passwordHash = await service.hash(password);

    await expect(service.verify(passwordHash, password)).resolves.toBe(true);
    await expect(service.verify(passwordHash, password.trim())).resolves.toBe(
      false,
    );
  });

  // ---------------------------------------------
  // Regras de tamanho e exposição em vazamentos
  // ---------------------------------------------
  it.each(['Aa1@bc', `Aa1@${'b'.repeat(130)}`])(
    'rejeita senha fora de 8 a 128 caracteres',
    async (password) => {
      await expect(service.hash(password)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(compromised).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['sem maiúscula', 'senha@123'],
    ['sem número', 'SenhaSegura@'],
    ['sem caractere especial', 'SenhaSegura1'],
  ])('rejeita senha %s', async (_caso, password) => {
    await expect(service.hash(password)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(compromised).not.toHaveBeenCalled();
  });

  it('conta pontos de código Unicode, não unidades UTF-16', async () => {
    // 128 pontos de código, mas 252 unidades UTF-16: contando errado, esta
    // senha válida seria recusada por estourar o limite máximo.
    const password = `Aa1@${'😀'.repeat(124)}`;

    expect(Array.from(password)).toHaveLength(128);
    expect(password.length).toBeGreaterThan(128);
    await expect(service.hash(password)).resolves.toMatch(/^\$argon2id\$/);
  });

  it('rejeita senha encontrada no corpus comprometido', async () => {
    compromised.mockResolvedValue(true);

    await expect(service.hash('Uma senha comprometida 1!')).rejects.toThrow(
      'Escolha uma senha que não apareça em vazamentos conhecidos.',
    );
  });

  // ---------------------------------------------
  // Proteção contra diferença de tempo observável
  // ---------------------------------------------
  it('executa verificação Argon2 fictícia para contas inexistentes', async () => {
    await expect(service.verifyDummy('qualquer tentativa')).resolves.toBe(
      false,
    );
  });
});
