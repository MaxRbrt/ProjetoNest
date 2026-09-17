import { DataSource } from 'typeorm';
import { Categoria } from '../../src/modules/categorias/categoria.entity';
import { Endereco } from '../../src/modules/enderecos/endereco.entity';
import { EnderecosService } from '../../src/modules/enderecos/enderecos.service';
import { MetricasService } from '../../src/modules/metricas/metricas.service';
import {
  Pagamento,
  SituacaoDoPagamento,
} from '../../src/modules/pagamentos/entities/pagamento.entity';
import {
  Pedido,
  SituacaoDoPedido,
} from '../../src/modules/pedidos/entities/pedido.entity';
import { PedidosService } from '../../src/modules/pedidos/pedidos.service';
import { Produto } from '../../src/modules/produtos/produto.entity';
import { Papel, Usuario } from '../../src/modules/usuarios/usuario.entity';
import { UsuarioPublico } from '../../src/modules/usuarios/usuarios.service';
import {
  abrirBancoDeTeste,
  fecharBancoDeTeste,
  limparTabelas,
} from './ambiente';

// 14:00 em São Paulo. Janela 7d atual: [10/09 03:00Z, 16/09 17:00Z);
// anterior: [03/09 03:00Z, 09/09 17:00Z).
const AGORA = new Date('2026-09-16T17:00:00.000Z');

// ---------------------------------------------
// MetricasService contra Postgres real
// orders.createdAt é TIMESTAMP sem fuso (gravado em UTC) e payments.createdAt
// é TIMESTAMPTZ: só o banco real prova que a conversão de fuso, as bordas da
// janela (início incluso, fim excluído) e o agrupamento por dia de São Paulo
// estão certos. Os pedidos nascem pelo PedidosService real e o teste ajusta
// situação, total e data por UPDATE parametrizado.
// ---------------------------------------------
describe('MetricasService (integração)', () => {
  let conexao: DataSource;
  let pedidosService: PedidosService;
  let metricasService: MetricasService;
  let usuarioPublico: UsuarioPublico;
  let produto: Produto;
  let enderecoId: number;

  beforeAll(async () => {
    conexao = await abrirBancoDeTeste();
  });

  afterAll(async () => {
    await limparTabelas(conexao);
    await fecharBancoDeTeste();
  });

  beforeEach(async () => {
    await limparTabelas(conexao);

    pedidosService = new PedidosService(conexao.getRepository(Pedido));
    metricasService = new MetricasService(
      conexao.getRepository(Pedido),
      conexao.getRepository(Pagamento),
    );

    const repositorioDeUsuarios = conexao.getRepository(Usuario);
    const usuario = await repositorioDeUsuarios.save(
      repositorioDeUsuarios.create({
        email: 'comprador-metricas@exemplo.local',
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
      .save(conexao.getRepository(Categoria).create({ nome: 'Métricas' }));
    produto = await conexao.getRepository(Produto).save(
      conexao.getRepository(Produto).create({
        nome: 'Produto métricas',
        precoEmCentavos: 1000,
        estoque: 50,
        categoriaId: categoria.id,
      }),
    );

    const endereco = await new EnderecosService(
      conexao.getRepository(Endereco),
    ).criar(usuario.id, {
      apelido: 'Casa',
      destinatario: 'Fulano',
      cep: '01310100',
      logradouro: 'Rua Um',
      numero: '1',
      bairro: 'Bairro',
      cidade: 'São Paulo',
      uf: 'SP',
    });
    enderecoId = endereco.id;
  });

  async function pedido(
    situacao: SituacaoDoPedido,
    totalEmCentavos: number,
    criadoEmUtc: string,
  ): Promise<number> {
    const criado = await pedidosService.criar(
      {
        enderecoId,
        modalidadeDeFrete: 'PAC',
        itens: [{ produtoId: produto.id, quantidade: 1 }],
      },
      usuarioPublico,
    );
    await conexao.query(
      `UPDATE "orders"
          SET "status" = $1, "totalInCents" = $2, "createdAt" = $3::timestamp
        WHERE "id" = $4`,
      [situacao, totalEmCentavos, criadoEmUtc, criado.id],
    );
    return criado.id;
  }

  async function pagamento(
    pedidoId: number,
    status: SituacaoDoPagamento,
    criadoEm: string,
  ): Promise<void> {
    const repositorio = conexao.getRepository(Pagamento);
    const salvo = await repositorio.save(
      repositorio.create({
        pedidoId,
        status,
        ultimosDigitosDoCartao: '1111',
        motivoDeRecusa: null,
      }),
    );
    await conexao.query(
      `UPDATE "payments" SET "createdAt" = $1::timestamptz WHERE "id" = $2`,
      [criadoEm, salvo.id],
    );
  }

  async function cenarioCompleto(): Promise<void> {
    // Janela atual
    const a = await pedido(SituacaoDoPedido.PAGO, 10000, '2026-09-10 03:00:00');
    await pedido(SituacaoDoPedido.ENTREGUE, 20000, '2026-09-16 02:30:00');
    await pedido(SituacaoDoPedido.ENVIADO, 5000, '2026-09-16 16:59:59');
    await pedido(SituacaoDoPedido.PENDENTE, 7000, '2026-09-12 12:00:00');
    await pedido(SituacaoDoPedido.CANCELADO, 9000, '2026-09-12 12:00:00');
    // Fora das duas janelas: fim excluído e antes do início atual
    await pedido(SituacaoDoPedido.PAGO, 99999, '2026-09-16 17:00:00');
    await pedido(SituacaoDoPedido.PAGO, 3000, '2026-09-10 02:59:59');
    // Janela anterior
    await pedido(SituacaoDoPedido.PAGO, 8000, '2026-09-05 12:00:00');
    await pedido(SituacaoDoPedido.PENDENTE, 1000, '2026-09-05 12:00:00');

    await pagamento(a, SituacaoDoPagamento.APROVADO, '2026-09-11T10:00:00Z');
    await pagamento(a, SituacaoDoPagamento.APROVADO, '2026-09-12T10:00:00Z');
    await pagamento(a, SituacaoDoPagamento.APROVADO, '2026-09-13T10:00:00Z');
    await pagamento(a, SituacaoDoPagamento.RECUSADO, '2026-09-14T10:00:00Z');
    await pagamento(a, SituacaoDoPagamento.PENDENTE, '2026-09-14T11:00:00Z');
    await pagamento(a, SituacaoDoPagamento.RECUSADO, '2026-09-01T10:00:00Z');
  }

  it('soma faturamento só de pedidos pagos, enviados e entregues', async () => {
    await cenarioCompleto();

    const metricas = await metricasService.obter('7d', AGORA);

    expect(metricas.resumo.faturamentoEmCentavos).toEqual({
      atual: 35000,
      anterior: 8000,
    });
  });

  it('conta pedidos não cancelados e calcula o ticket pelos faturados', async () => {
    await cenarioCompleto();

    const metricas = await metricasService.obter('7d', AGORA);

    expect(metricas.resumo.pedidos).toEqual({ atual: 4, anterior: 2 });
    expect(metricas.resumo.ticketMedioEmCentavos).toEqual({
      atual: 11667,
      anterior: 8000,
    });
  });

  it('taxa de recusa ignora pendentes e é null sem pagamento concluído', async () => {
    await cenarioCompleto();

    const metricas = await metricasService.obter('7d', AGORA);

    expect(metricas.resumo.taxaDeRecusa).toEqual({
      atual: 0.25,
      anterior: null,
    });
  });

  it('agrupa vendas pelo dia de São Paulo e preenche dias sem venda', async () => {
    await cenarioCompleto();

    const metricas = await metricasService.obter('7d', AGORA);

    expect(metricas.vendasPorDia).toEqual([
      { dia: '2026-09-10', faturamentoEmCentavos: 10000, pedidos: 1 },
      { dia: '2026-09-11', faturamentoEmCentavos: 0, pedidos: 0 },
      { dia: '2026-09-12', faturamentoEmCentavos: 0, pedidos: 0 },
      { dia: '2026-09-13', faturamentoEmCentavos: 0, pedidos: 0 },
      { dia: '2026-09-14', faturamentoEmCentavos: 0, pedidos: 0 },
      { dia: '2026-09-15', faturamentoEmCentavos: 20000, pedidos: 1 },
      { dia: '2026-09-16', faturamentoEmCentavos: 5000, pedidos: 1 },
    ]);
  });

  it('sem nenhum dado devolve zeros, ticket 0 e taxa null', async () => {
    const metricas = await metricasService.obter('hoje', AGORA);

    expect(metricas).toEqual({
      periodo: 'hoje',
      fuso: 'America/Sao_Paulo',
      janela: {
        inicio: '2026-09-16T03:00:00.000Z',
        fim: '2026-09-16T17:00:00.000Z',
      },
      resumo: {
        faturamentoEmCentavos: { atual: 0, anterior: 0 },
        pedidos: { atual: 0, anterior: 0 },
        ticketMedioEmCentavos: { atual: 0, anterior: 0 },
        taxaDeRecusa: { atual: null, anterior: null },
      },
      vendasPorDia: [
        { dia: '2026-09-16', faturamentoEmCentavos: 0, pedidos: 0 },
      ],
    });
  });
});
