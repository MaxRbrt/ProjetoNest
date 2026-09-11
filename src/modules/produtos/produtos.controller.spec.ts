import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ProdutosController } from './produtos.controller';
import { ProdutosService } from './produtos.service';

// ---------------------------------------------
// Upload de imagem pela camada HTTP
// Exercita o interceptor e o filtro reais, com o serviço substituído para
// isolar banco e disco. Sem guards globais neste módulo de teste, a restrição
// a ADMIN não é exercitada aqui; sua cobertura fica nos testes de autorização.
// ---------------------------------------------
describe('ProdutosController (upload HTTP)', () => {
  let app: INestApplication;
  const produtosService = {
    listar: jest.fn(),
    definirImagem: jest.fn(),
    removerImagem: jest.fn(),
    lerImagem: jest.fn(),
    buscarPorId: jest.fn(),
    criar: jest.fn(),
    atualizar: jest.fn(),
    remover: jest.fn(),
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [ProdutosController],
      providers: [{ provide: ProdutosService, useValue: produtosService }],
    }).compile();

    app = modulo.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde 413 em PT-BR quando a imagem excede 2 MB', async () => {
    const resposta = await request(app.getHttpServer())
      .post('/products/1/image')
      .attach('imagem', Buffer.alloc(3 * 1024 * 1024), 'grande.png');

    expect(resposta.status).toBe(413);
    expect(resposta.body).toEqual({
      statusCode: 413,
      message: 'A imagem excede o limite de 2 MB.',
      error: 'Payload Too Large',
    });
    expect(produtosService.definirImagem).not.toHaveBeenCalled();
  });

  it('encaminha o Buffer da imagem pequena ao serviço e devolve seu resultado', async () => {
    const imagem = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const produto = { id: 1, nomeDoArquivoDaImagem: 'produto.png' };
    produtosService.definirImagem.mockResolvedValue(produto);

    const resposta = await request(app.getHttpServer())
      .post('/products/1/image')
      .attach('imagem', imagem, 'pequena.png');

    expect(resposta.status).toBe(201);
    expect(resposta.body).toEqual(produto);
    expect(produtosService.definirImagem).toHaveBeenCalledTimes(1);
    expect(produtosService.definirImagem).toHaveBeenCalledWith(1, imagem);
    expect(
      Buffer.isBuffer(produtosService.definirImagem.mock.calls[0][1]),
    ).toBe(true);
  });

  it('recusa campo multipart extra antes de acumular dados fora da imagem', async () => {
    const imagem = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    const resposta = await request(app.getHttpServer())
      .post('/products/1/image')
      .field('descricao', 'x'.repeat(1024))
      .attach('imagem', imagem, 'pequena.png');

    expect(resposta.status).toBe(400);
    expect(produtosService.definirImagem).not.toHaveBeenCalled();
  });
});
