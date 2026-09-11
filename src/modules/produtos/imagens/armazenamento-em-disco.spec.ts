import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArmazenamentoEmDisco, nomeDeArquivoEhValido } from './armazenamento-em-disco';

// ---------------------------------------------
// Armazenamento em disco
// Roda contra um diretório temporário de verdade, não contra mock de fs: o
// que precisa ser provado é que o arquivo existe no disco com o conteúdo
// certo e some quando mandado sumir. Um mock provaria só que uma função foi
// chamada.
// ---------------------------------------------
describe('ArmazenamentoEmDisco', () => {
  let diretorio: string;
  let armazenamento: ArmazenamentoEmDisco;

  beforeEach(async () => {
    diretorio = await mkdtemp(join(tmpdir(), 'imagens-teste-'));
    armazenamento = new ArmazenamentoEmDisco(diretorio);
  });

  it('grava o conteúdo e devolve um nome gerado, não o que veio de fora', async () => {
    const conteudo = Buffer.from('conteudo-binario-qualquer');

    const nome = await armazenamento.gravar(conteudo, 'png');

    expect(nome).toMatch(/^[0-9a-f-]{36}\.png$/);
    await expect(readFile(join(diretorio, nome))).resolves.toEqual(conteudo);
  });

  it('gera nomes diferentes para conteúdos idênticos', async () => {
    const conteudo = Buffer.from('mesmo-conteudo');

    const primeiro = await armazenamento.gravar(conteudo, 'jpg');
    const segundo = await armazenamento.gravar(conteudo, 'jpg');

    expect(primeiro).not.toBe(segundo);
    expect(await readdir(diretorio)).toHaveLength(2);
  });

  it('lê o que gravou', async () => {
    const conteudo = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const nome = await armazenamento.gravar(conteudo, 'png');

    await expect(armazenamento.ler(nome)).resolves.toEqual(conteudo);
  });

  it('devolve null ao ler arquivo inexistente, em vez de lançar', async () => {
    await expect(
      armazenamento.ler('00000000-0000-0000-0000-000000000000.png'),
    ).resolves.toBeNull();
  });

  it('apaga o arquivo', async () => {
    const nome = await armazenamento.gravar(Buffer.from('x'), 'webp');

    await armazenamento.apagar(nome);

    expect(await readdir(diretorio)).toEqual([]);
  });

  it('apagar arquivo inexistente não lança', async () => {
    await expect(
      armazenamento.apagar('00000000-0000-0000-0000-000000000000.png'),
    ).resolves.toBeUndefined();
  });

  it('recusa nome fora do formato antes de tocar o disco', async () => {
    const alvo = join(diretorio, '..', 'alvo-fora-do-diretorio.txt');
    await writeFile(alvo, 'conteudo que não pode ser lido nem apagado');

    await expect(armazenamento.ler('../alvo-fora-do-diretorio.txt')).rejects.toThrow(
      /nome de arquivo/i,
    );
    await expect(armazenamento.apagar('../alvo-fora-do-diretorio.txt')).rejects.toThrow(
      /nome de arquivo/i,
    );
    await expect(readFile(alvo, 'utf8')).resolves.toContain('não pode ser lido');
  });

  it('recusa extensão que escaparia do diretório', async () => {
    await expect(
      armazenamento.gravar(Buffer.from('x'), 'png/../../fora'),
    ).rejects.toThrow(/nome de arquivo/i);
  });

  it('recusa extensão fora da lista aceita', async () => {
    await expect(armazenamento.gravar(Buffer.from('x'), 'svg')).rejects.toThrow(
      /nome de arquivo/i,
    );
  });
});

describe('nomeDeArquivoEhValido', () => {
  it('aceita o formato gerado pelo próprio armazenamento', () => {
    expect(nomeDeArquivoEhValido('6f1c2f3a-1111-4222-8333-444455556666.jpg')).toBe(true);
    expect(nomeDeArquivoEhValido('6f1c2f3a-1111-4222-8333-444455556666.png')).toBe(true);
    expect(nomeDeArquivoEhValido('6f1c2f3a-1111-4222-8333-444455556666.webp')).toBe(true);
  });

  it('recusa travessia de caminho, extensão estranha e vazio', () => {
    expect(nomeDeArquivoEhValido('../etc/passwd')).toBe(false);
    expect(nomeDeArquivoEhValido('6f1c2f3a-1111-4222-8333-444455556666.svg')).toBe(false);
    expect(nomeDeArquivoEhValido('6f1c2f3a-1111-4222-8333-444455556666.png/../x')).toBe(false);
    expect(nomeDeArquivoEhValido('')).toBe(false);
  });
});
