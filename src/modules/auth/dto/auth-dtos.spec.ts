import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';
import { RegisterDto } from './register.dto';
import { ResetPasswordDto } from './reset-password.dto';
import { VerifyEmailDto } from './verify-email.dto';

describe('DTOs de autenticação', () => {
  it('normaliza email sem alterar a senha', async () => {
    const input = {
      email: '  Usuario@Example.COM  ',
      password: '  frase senha segura  ',
    };
    const dto = plainToInstance(RegisterDto, input);

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.email).toBe('usuario@example.com');
    expect(dto.password).toBe(input.password);
  });

  it('aplica a mesma normalização ao login', async () => {
    const dto = plainToInstance(LoginDto, {
      email: ' USUARIO@EXAMPLE.COM ',
      password: 'senha fornecida sem trim',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.email).toBe('usuario@example.com');
    expect(dto.password).toBe('senha fornecida sem trim');
  });

  it('rejeita token que não seja base64url de 256 bits', async () => {
    const dto = plainToInstance(VerifyEmailDto, { token: 'token curto' });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });

  it('valida a nova senha no reset sem aplicar trim', async () => {
    const password = '  nova frase senha  ';
    const dto = plainToInstance(ResetPasswordDto, {
      token: 'A'.repeat(43),
      newPassword: password,
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.newPassword).toBe(password);
  });
});
