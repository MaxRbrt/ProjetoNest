import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const TOKEN_VALIDO = 'A'.repeat(43);

async function errosDaSenha(senha: string): Promise<string[]> {
  const dto = plainToInstance(RegisterDto, {
    email: 'usuario@example.com',
    password: senha,
  });
  const erros = await validate(dto);
  return erros.flatMap((erro) => Object.values(erro.constraints ?? {}));
}

describe('Regras de senha', () => {
  // ---------------------------------------------
  // Comprimento aceito
  // ---------------------------------------------
  it('aceita senha de oito caracteres que cumpre a composição', async () => {
    expect(await errosDaSenha('Senha@12')).toHaveLength(0);
  });

  it('recusa senha com menos de oito caracteres', async () => {
    expect(await errosDaSenha('Se@1')).not.toHaveLength(0);
  });

  it('recusa senha acima de 128 caracteres', async () => {
    const longa = `A1@${'a'.repeat(130)}`;
    expect(await errosDaSenha(longa)).not.toHaveLength(0);
  });

  // ---------------------------------------------
  // Composição exigida
  // Cada regra é verificada isoladamente para que a mensagem devolvida ao
  // usuário aponte o que falta, em vez de recusar sem explicar.
  // ---------------------------------------------
  it('recusa senha sem letra maiúscula', async () => {
    expect(await errosDaSenha('senha@123')).not.toHaveLength(0);
  });

  it('recusa senha sem número', async () => {
    expect(await errosDaSenha('SenhaSegura@')).not.toHaveLength(0);
  });

  it('recusa senha sem caractere especial', async () => {
    expect(await errosDaSenha('SenhaSegura1')).not.toHaveLength(0);
  });

  it('explica o que falta na mensagem de recusa', async () => {
    const mensagens = await errosDaSenha('senhasimples');
    expect(mensagens.join(' ')).toMatch(/maiúscula/i);
  });

  // ---------------------------------------------
  // Aceitação de senhas fortes variadas
  // ---------------------------------------------
  it('aceita frase longa que cumpre a composição', async () => {
    expect(await errosDaSenha('Cavalo bateria grampo correto 7!')).toHaveLength(
      0,
    );
  });

  it('aceita caracteres especiais diversos, incluindo espaço', async () => {
    for (const senha of ['Abcdef1#', 'Abcdef1$', 'Abcdef1 ', 'Abcdef1-']) {
      expect(await errosDaSenha(senha)).toHaveLength(0);
    }
  });

  it('não considera letra acentuada como caractere especial', async () => {
    // "ç" e "á" são letras: aceitá-las como especial deixaria passar senha
    // sem nenhum símbolo, contrariando a regra que o formulário anuncia.
    expect(await errosDaSenha('Abcdefç1')).not.toHaveLength(0);
  });

  it('acusa todas as exigências que faltam de uma vez', async () => {
    const mensagens = await errosDaSenha('abcdefgh');
    const texto = mensagens.join(' ');
    expect(texto).toMatch(/maiúscula/i);
    expect(texto).toMatch(/número/i);
    expect(texto).toMatch(/especial/i);
  });

  // ---------------------------------------------
  // Mesma regra na redefinição
  // Cadastro e redefinição precisam exigir o mesmo: se divergirem, o usuário
  // consegue trocar por uma senha que não passaria no cadastro.
  // ---------------------------------------------
  it('aplica a mesma regra à redefinição de senha', async () => {
    const fraca = plainToInstance(ResetPasswordDto, {
      token: TOKEN_VALIDO,
      newPassword: 'senhafraca',
    });
    expect(await validate(fraca)).not.toHaveLength(0);

    const forte = plainToInstance(ResetPasswordDto, {
      token: TOKEN_VALIDO,
      newPassword: 'Senha@12',
    });
    expect(await validate(forte)).toHaveLength(0);
  });
});
