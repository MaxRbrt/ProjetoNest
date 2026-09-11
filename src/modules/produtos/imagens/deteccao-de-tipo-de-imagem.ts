// ---------------------------------------------
// Reconhecimento de imagem pela assinatura de bytes
// O Content-Type declarado no upload é escolhido por quem envia e não serve
// como decisão de segurança: um executável renomeado chega com
// "image/png" sem nenhum esforço. Só os bytes iniciais decidem aqui, e é
// esta função que define tanto a extensão gravada quanto o Content-Type
// devolvido na entrega — nada vindo do cliente participa dos dois.
//
// WebP precisa de duas marcas separadas porque RIFF sozinho também abre WAV
// e AVI. SVG não aparece na lista de propósito: é XML, executa script ao ser
// servido inline, e não existe forma segura de exibir um SVG de terceiro na
// mesma origem da aplicação.
// ---------------------------------------------
export interface TipoDeImagem {
  extensao: 'jpg' | 'png' | 'webp';
  contentType: string;
}

const ASSINATURA_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export function detectarTipoDeImagem(conteudo: Buffer): TipoDeImagem | null {
  if (conteudo.length >= 3 && conteudo[0] === 0xff && conteudo[1] === 0xd8 && conteudo[2] === 0xff) {
    return { extensao: 'jpg', contentType: 'image/jpeg' };
  }
  if (conteudo.length >= 8 && conteudo.subarray(0, 8).equals(ASSINATURA_PNG)) {
    return { extensao: 'png', contentType: 'image/png' };
  }
  if (
    conteudo.length >= 12 &&
    conteudo.subarray(0, 4).toString('ascii') === 'RIFF' &&
    conteudo.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { extensao: 'webp', contentType: 'image/webp' };
  }
  return null;
}
