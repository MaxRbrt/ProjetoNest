import { BadRequestException } from '@nestjs/common';
import { SenhaService } from './senha.service';
import { SenhasVazadasService } from './senhas-vazadas.service';

// ---------------------------------------------
// SenhaService
// Cobre hashing/verificação, a proteção temporal contra conta inexistente
// (verificarFalsa) e a contagem de senha por ponto de código Unicode, não
// por .length — ver comentário de exigenciasNaoCumpridas em politica-de-senha.ts.
// O caso do emoji astral é a prova dessa contagem: "😀Aa1!bc" tem 7 pontos de
// código (o emoji é 1), mas ocupa 2 unidades UTF-16, então .length nativo dá
// 8 — se a validação usasse .length, essa senha passaria pelo mínimo.
// ---------------------------------------------
describe('SenhaService', () => {
  let senhasVazadas: { estaComprometida: jest.Mock };
  let servico: SenhaService;

  beforeEach(() => {
    senhasVazadas = { estaComprometida: jest.fn().mockResolvedValue(false) };
    servico = new SenhaService(
      senhasVazadas as unknown as SenhasVazadasService,
    );
  });

  const SENHA_VALIDA = 'Aa1!bcde'; // 8 codepoints, cumpre todas as exigências

  describe('hash / verify', () => {
    it('produz um hash diferente da senha original', async () => {
      const hash = await servico.hash(SENHA_VALIDA);
      expect(hash).not.toBe(SENHA_VALIDA);
      expect(hash.startsWith('$argon2id$')).toBe(true);
    });

    it('verify aceita a senha correta e rejeita a errada', async () => {
      const hash = await servico.hash(SENHA_VALIDA);
      await expect(servico.verify(hash, SENHA_VALIDA)).resolves.toBe(true);
      await expect(servico.verify(hash, 'OutraSenha1!')).resolves.toBe(false);
    });
  });

  describe('política aplicada dentro do serviço, não só no DTO', () => {
    it('rejeita senha que não cumpre a composição, mesmo sem passar pelo DTO', async () => {
      await expect(servico.hash('semnumeroesimbolo')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejeita senha comprometida segundo a checagem HIBP', async () => {
      senhasVazadas.estaComprometida.mockResolvedValue(true);
      await expect(servico.hash(SENHA_VALIDA)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('contagem por ponto de código, não por .length', () => {
    it('rejeita senha com 7 pontos de código mesmo quando .length é 8 (emoji astral)', async () => {
      const senhaComEmoji = '😀Aa1!bc';
      expect(Array.from(senhaComEmoji).length).toBe(7);
      expect(senhaComEmoji.length).toBe(8);

      await expect(servico.hash(senhaComEmoji)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('aceita senha com exatamente 8 pontos de código incluindo um emoji astral', async () => {
      const senhaComEmoji = '😀Aa1!bcd'; // 8 codepoints
      expect(Array.from(senhaComEmoji).length).toBe(8);

      const hash = await servico.hash(senhaComEmoji);
      expect(hash.startsWith('$argon2id$')).toBe(true);
    });
  });

  describe('verificarFalsa — proteção temporal contra conta inexistente', () => {
    it('nunca lança e nunca aceita nenhuma senha real como válida', async () => {
      await expect(servico.verificarFalsa(SENHA_VALIDA)).resolves.toBe(false);
      await expect(servico.verificarFalsa('qualquer-coisa')).resolves.toBe(
        false,
      );
    });
  });
});
