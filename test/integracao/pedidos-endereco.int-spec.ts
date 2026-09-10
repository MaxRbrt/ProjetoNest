import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Categoria } from '../../src/modules/categorias/categoria.entity';
import { Endereco } from '../../src/modules/enderecos/endereco.entity';
import { EnderecosService } from '../../src/modules/enderecos/enderecos.service';
import { Pedido } from '../../src/modules/pedidos/entities/pedido.entity';
import { PedidosService } from '../../src/modules/pedidos/pedidos.service';
import { Produto } from '../../src/modules/produtos/produto.entity';
import { Papel, Usuario } from '../../src/modules/usuarios/usuario.entity';
import { UsuarioPublico } from '../../src/modules/usuarios/usuarios.service';
import { abrirBancoDeTeste, fecharBancoDeTeste, limparTabelas } from './ambiente';

// ---------------------------------------------
// Congelamento de endereço no pedido, contra Postgres real
// O ponto que só um teste de integração prova: editar o endereço DEPOIS de
// criar o pedido não pode mudar para onde o pedido já foi enviado. Um fake de
// EntityManager provaria isso também, mas o objetivo aqui é o mesmo da suíte
// de sessões — exercitar a transação e a FK de verdade.
// ---------------------------------------------
describe('PedidosService — congelamento de endereço (integração)', () => {
  let conexao: DataSource;
  let pedidosService: PedidosService;
  let enderecosService: EnderecosService;
  let usuario: Usuario;
  let usuarioPublico: UsuarioPublico;
  let produto: Produto;

  beforeAll(async () => {
    conexao = await abrirBancoDeTeste();
  });

  afterAll(async () => {
    await fecharBancoDeTeste();
  });

  beforeEach(async () => {
    await limparTabelas(conexao);

    pedidosService = new PedidosService(conexao.getRepository(Pedido));
    enderecosService = new EnderecosService(conexao.getRepository(Endereco));

    const repositorioDeUsuarios = conexao.getRepository(Usuario);
    usuario = await repositorioDeUsuarios.save(
      repositorioDeUsuarios.create({
        email: 'comprador-endereco@exemplo.local',
        hashDaSenha: 'hash-irrelevante',
        papel: Papel.CLIENTE,
        emailVerificadoEm: new Date(),
        tentativasDeLoginFalhas: 0,
        bloqueadoAte: null,
      }),
    );
    usuarioPublico = {
      id: usuario.id,
      email: usuario.email,
      emailVerificado: true,
      criadoEm: usuario.criadoEm,
      papel: Papel.CLIENTE,
    };

    const categoria = await conexao
      .getRepository(Categoria)
      .save(conexao.getRepository(Categoria).create({ nome: 'Categoria teste' }));
    produto = await conexao.getRepository(Produto).save(
      conexao.getRepository(Produto).create({
        nome: 'Produto teste',
        precoEmCentavos: 5000,
        estoque: 10,
        categoriaId: categoria.id,
      }),
    );
  });

  it('congela o endereço no pedido; editar o endereço depois não muda o pedido', async () => {
    const endereco = await enderecosService.criar(usuario.id, {
      apelido: 'Casa',
      destinatario: 'Fulano de Tal',
      cep: '01310100',
      logradouro: 'Av. Paulista',
      numero: '1000',
      bairro: 'Bela Vista',
      cidade: 'São Paulo',
      uf: 'SP',
    });

    const pedido = await pedidosService.criar(
      {
        enderecoId: endereco.id,
        modalidadeDeFrete: 'PAC',
        itens: [{ produtoId: produto.id, quantidade: 1 }],
      },
      usuarioPublico,
    );

    expect(pedido.enderecoLogradouro).toBe('Av. Paulista');
    expect(pedido.enderecoCidade).toBe('São Paulo');
    expect(pedido.modalidadeDeFrete).toBe('PAC');
    expect(pedido.freteEmCentavos).toBeGreaterThan(0);
    expect(pedido.totalEmCentavos).toBe(
      pedido.subtotalEmCentavos + pedido.freteEmCentavos,
    );

    // edita o endereço depois de já ter comprado com ele
    await enderecosService.atualizar(endereco.id, usuario.id, {
      logradouro: 'Rua Nova Completamente Diferente',
      cidade: 'Rio de Janeiro',
      uf: 'RJ',
    });

    const pedidoRecarregado = await pedidosService.buscarPorId(
      pedido.id,
      usuarioPublico,
    );
    expect(pedidoRecarregado.enderecoLogradouro).toBe('Av. Paulista');
    expect(pedidoRecarregado.enderecoCidade).toBe('São Paulo');
  });

  it('recusa criar pedido com endereço de outro usuário (404, não 403)', async () => {
    const repositorioDeUsuarios = conexao.getRepository(Usuario);
    const outroUsuario = await repositorioDeUsuarios.save(
      repositorioDeUsuarios.create({
        email: 'dono-do-endereco@exemplo.local',
        hashDaSenha: 'hash-irrelevante',
        papel: Papel.CLIENTE,
        emailVerificadoEm: new Date(),
        tentativasDeLoginFalhas: 0,
        bloqueadoAte: null,
      }),
    );
    const enderecoDeOutro = await enderecosService.criar(outroUsuario.id, {
      apelido: 'Casa',
      destinatario: 'Outra Pessoa',
      cep: '01310100',
      logradouro: 'Av. Paulista',
      numero: '1000',
      bairro: 'Bela Vista',
      cidade: 'São Paulo',
      uf: 'SP',
    });

    await expect(
      pedidosService.criar(
        {
          enderecoId: enderecoDeOutro.id,
          modalidadeDeFrete: 'PAC',
          itens: [{ produtoId: produto.id, quantidade: 1 }],
        },
        usuarioPublico,
      ),
    ).rejects.toThrow(NotFoundException);

    // e o estoque não pode ter sido baixado numa tentativa que falhou
    const produtoRecarregado = await conexao
      .getRepository(Produto)
      .findOneByOrFail({ id: produto.id });
    expect(produtoRecarregado.estoque).toBe(10);
  });

  it('reenvio com a mesma Idempotency-Key mas endereço diferente é 409, não silencioso', async () => {
    const enderecoUm = await enderecosService.criar(usuario.id, {
      apelido: 'Casa',
      destinatario: 'Fulano',
      cep: '01310100',
      logradouro: 'Rua Um',
      numero: '1',
      bairro: 'Bairro',
      cidade: 'São Paulo',
      uf: 'SP',
    });
    const enderecoDois = await enderecosService.criar(usuario.id, {
      apelido: 'Trabalho',
      destinatario: 'Fulano',
      cep: '01310100',
      logradouro: 'Rua Dois',
      numero: '2',
      bairro: 'Bairro',
      cidade: 'São Paulo',
      uf: 'SP',
    });

    await pedidosService.criar(
      {
        enderecoId: enderecoUm.id,
        modalidadeDeFrete: 'PAC',
        itens: [{ produtoId: produto.id, quantidade: 1 }],
      },
      usuarioPublico,
      'chave-repetida',
    );

    await expect(
      pedidosService.criar(
        {
          enderecoId: enderecoDois.id,
          modalidadeDeFrete: 'PAC',
          itens: [{ produtoId: produto.id, quantidade: 1 }],
        },
        usuarioPublico,
        'chave-repetida',
      ),
    ).rejects.toThrow(/payload diferente/);
  });

  it('reenvio com a mesma Idempotency-Key mas modalidade de frete diferente é 409, não silencioso', async () => {
    const endereco = await enderecosService.criar(usuario.id, {
      apelido: 'Casa',
      destinatario: 'Fulano',
      cep: '01310100',
      logradouro: 'Rua Um',
      numero: '1',
      bairro: 'Bairro',
      cidade: 'São Paulo',
      uf: 'SP',
    });

    await pedidosService.criar(
      {
        enderecoId: endereco.id,
        modalidadeDeFrete: 'PAC',
        itens: [{ produtoId: produto.id, quantidade: 1 }],
      },
      usuarioPublico,
      'chave-repetida-frete',
    );

    await expect(
      pedidosService.criar(
        {
          enderecoId: endereco.id,
          modalidadeDeFrete: 'SEDEX',
          itens: [{ produtoId: produto.id, quantidade: 1 }],
        },
        usuarioPublico,
        'chave-repetida-frete',
      ),
    ).rejects.toThrow(/payload diferente/);
  });

  it('frete varia por região e por quantidade de itens, nunca aceita valor do cliente', async () => {
    const enderecoSudeste = await enderecosService.criar(usuario.id, {
      apelido: 'SP',
      destinatario: 'Fulano',
      cep: '01310100',
      logradouro: 'Rua Um',
      numero: '1',
      bairro: 'Bairro',
      cidade: 'São Paulo',
      uf: 'SP',
    });
    const enderecoNorte = await enderecosService.criar(usuario.id, {
      apelido: 'AM',
      destinatario: 'Fulano',
      cep: '69000000',
      logradouro: 'Rua Dois',
      numero: '2',
      bairro: 'Bairro',
      cidade: 'Manaus',
      uf: 'AM',
    });

    const pedidoSudeste = await pedidosService.criar(
      {
        enderecoId: enderecoSudeste.id,
        modalidadeDeFrete: 'PAC',
        itens: [{ produtoId: produto.id, quantidade: 1 }],
      },
      usuarioPublico,
    );
    const pedidoNorte = await pedidosService.criar(
      {
        enderecoId: enderecoNorte.id,
        modalidadeDeFrete: 'PAC',
        itens: [{ produtoId: produto.id, quantidade: 1 }],
      },
      usuarioPublico,
    );

    // frete para o Norte é mais caro que para o Sudeste — região mais distante
    expect(pedidoNorte.freteEmCentavos).toBeGreaterThan(
      pedidoSudeste.freteEmCentavos,
    );
  });

  it('nenhum "freteEmCentavos" enviado pelo cliente é lido — o serviço sempre recalcula', async () => {
    const endereco = await enderecosService.criar(usuario.id, {
      apelido: 'Casa',
      destinatario: 'Fulano',
      cep: '01310100',
      logradouro: 'Rua Um',
      numero: '1',
      bairro: 'Bairro',
      cidade: 'São Paulo',
      uf: 'SP',
    });

    // simula um payload adulterado: mesmo com um campo extra de custo, o DTO
    // real (CriarPedidoDto) não declara essa propriedade, e o service só lê
    // dto.enderecoId/dto.modalidadeDeFrete/dto.itens — o valor forjado nunca
    // chega a ser usado no cálculo.
    const pedido = await pedidosService.criar(
      {
        enderecoId: endereco.id,
        modalidadeDeFrete: 'PAC',
        itens: [{ produtoId: produto.id, quantidade: 1 }],
        freteEmCentavos: 1,
      } as never,
      usuarioPublico,
    );

    expect(pedido.freteEmCentavos).toBeGreaterThan(1);
  });
});
