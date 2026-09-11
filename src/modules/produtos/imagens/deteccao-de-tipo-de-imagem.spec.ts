import { detectarTipoDeImagem } from './deteccao-de-tipo-de-imagem';

function bufferDe(...bytes: number[]): Buffer {
  return Buffer.from(bytes);
}

// ---------------------------------------------
// Detecção de tipo de imagem
// O mimetype enviado pelo cliente é texto livre e não participa de nenhuma
// decisão. Só a assinatura dos primeiros bytes decide, e é ela que define a
// extensão com que o arquivo será gravado e o Content-Type devolvido depois.
// SVG aparece aqui como caso recusado de propósito: é XML e executaria
// script se fosse servido inline.
// ---------------------------------------------
describe('detectarTipoDeImagem', () => {
  it('reconhece JPEG', () => {
    const conteudo = bufferDe(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);
    expect(detectarTipoDeImagem(conteudo)).toEqual({
      extensao: 'jpg',
      contentType: 'image/jpeg',
    });
  });

  it('reconhece PNG', () => {
    const conteudo = bufferDe(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00);
    expect(detectarTipoDeImagem(conteudo)).toEqual({
      extensao: 'png',
      contentType: 'image/png',
    });
  });

  it('reconhece WebP, que exige duas marcas separadas', () => {
    const conteudo = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      bufferDe(0x00, 0x00, 0x00, 0x00),
      Buffer.from('WEBP', 'ascii'),
    ]);
    expect(detectarTipoDeImagem(conteudo)).toEqual({
      extensao: 'webp',
      contentType: 'image/webp',
    });
  });

  it('recusa RIFF que não é WEBP (áudio WAV começa igual)', () => {
    const conteudo = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      bufferDe(0x00, 0x00, 0x00, 0x00),
      Buffer.from('WAVE', 'ascii'),
    ]);
    expect(detectarTipoDeImagem(conteudo)).toBeNull();
  });

  it('recusa SVG', () => {
    const conteudo = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8');
    expect(detectarTipoDeImagem(conteudo)).toBeNull();
  });

  it('recusa arquivo vazio', () => {
    expect(detectarTipoDeImagem(Buffer.alloc(0))).toBeNull();
  });

  it('recusa arquivo truncado no meio da assinatura', () => {
    expect(detectarTipoDeImagem(bufferDe(0xff, 0xd8))).toBeNull();
    expect(detectarTipoDeImagem(bufferDe(0x89, 0x50, 0x4e))).toBeNull();
  });

  it('recusa executável disfarçado de imagem', () => {
    const conteudo = Buffer.from('MZ\x90\x00\x03', 'binary');
    expect(detectarTipoDeImagem(conteudo)).toBeNull();
  });
});
