
// ---------------------------------------------
// Contrato de armazenamento de imagens
// O serviço de produtos não sabe onde o arquivo mora. Trocar disco por S3 ou
// Supabase Storage é escrever outra classe que satisfaça esta interface, sem
// tocar em regra de negócio — mesmo critério já aplicado ao provedor de
// pagamento.
//
// gravar() devolve o nome porque é ele quem gera o nome: quem chama não
// escolhe, e assim nenhum valor vindo do cliente chega ao sistema de
// arquivos.
// ---------------------------------------------
export const ARMAZENAMENTO_DE_IMAGENS = Symbol('ARMAZENAMENTO_DE_IMAGENS');

export interface ArmazenamentoDeImagens {
  gravar(conteudo: Buffer, extensao: string): Promise<string>;
  ler(nome: string): Promise<Buffer | null>;
  apagar(nome: string): Promise<void>;
}
