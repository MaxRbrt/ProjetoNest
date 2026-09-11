import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ArmazenamentoDeImagens } from './armazenamento-de-imagens';

const FORMATO_DO_NOME = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

export function nomeDeArquivoEhValido(nome: string): boolean {
  return FORMATO_DO_NOME.test(nome);
}

// ---------------------------------------------
// Armazenamento em disco
// O nome é sempre gerado aqui (UUID mais a extensão que a detecção de tipo
// decidiu), nunca derivado do nome enviado no upload: sanitizar nome de
// arquivo é uma corrida contra codificações e separadores que não precisa
// ser corrida se o valor nunca for usado. gravar() valida o nome montado
// antes de escrever, rejeitando extensões inválidas ou que escapariam do
// diretório.
//
// ler() e apagar() recebem o nome vindo do banco e ainda assim conferem o
// formato antes de tocar o disco. O valor já deveria ser confiável — é por
// isso que a checagem é barata, e é justamente o tipo de suposição que
// deixa de valer no dia em que a coluna for preenchida por outro caminho.
//
// Arquivo ausente em ler() devolve null porque é esperado: o banco pode
// apontar para um arquivo que sumiu do disco, e a entrega trata isso como
// imagem inexistente, não como falha do servidor. Porém, qualquer outro erro
// (permissão, disco cheio, I/O) é relançado — silenciar falhas reais de
// infraestrutura causaria problemas difíceis de debugar.
// ---------------------------------------------
export class ArmazenamentoEmDisco implements ArmazenamentoDeImagens {
  constructor(private readonly diretorio: string) {}

  async gravar(conteudo: Buffer, extensao: string): Promise<string> {
    const nome = `${randomUUID()}.${extensao}`;
    this.exigirNomeValido(nome);
    await mkdir(this.diretorio, { recursive: true });
    await writeFile(join(this.diretorio, nome), conteudo);
    return nome;
  }

  async ler(nome: string): Promise<Buffer | null> {
    this.exigirNomeValido(nome);
    try {
      return await readFile(join(this.diretorio, nome));
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw erro;
    }
  }

  async apagar(nome: string): Promise<void> {
    this.exigirNomeValido(nome);
    try {
      await unlink(join(this.diretorio, nome));
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw erro;
    }
  }

  private exigirNomeValido(nome: string): void {
    if (!nomeDeArquivoEhValido(nome)) {
      throw new Error(`Nome de arquivo de imagem inválido: ${nome}`);
    }
  }
}
