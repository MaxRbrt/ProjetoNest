import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Categoria } from '../../src/modules/categorias/categoria.entity';
import { Endereco } from '../../src/modules/enderecos/endereco.entity';
import { EnderecosService } from '../../src/modules/enderecos/enderecos.service';
import { EventoDeWebhookProcessado } from '../../src/modules/pagamentos/entities/evento-de-webhook-processado.entity';
import {
  Pagamento,
  SituacaoDoPagamento,
} from '../../src/modules/pagamentos/entities/pagamento.entity';
import { PagamentosService } from '../../src/modules/pagamentos/pagamentos.service';
import {
  assinarEvento,
  type EventoDePagamento,
} from '../../src/modules/pagamentos/assinatura-de-webhook';
import { Pedido, SituacaoDoPedido } from '../../src/modules/pedidos/entities/pedido.entity';
import { PedidosService } from '../../src/modules/pedidos/pedidos.service';
import { Produto } from '../../src/modules/produtos/produto.entity';
import { Papel, Usuario } from '../../src/modules/usuarios/usuario.entity';
import { UsuarioPublico } from '../../src/modules/usuarios/usuarios.service';
import { abrirBancoDeTeste, fecharBancoDeTeste, limparTabelas } from './ambiente';

const SEGREDO_DE_TESTE = 'segredo-de-webhook-para-integracao-32bytes!!';
const CARTAO_APROVADO = '4111111111111111';
const CARTAO_RECUSADO = '4000000000000002';

function configMock(): ConfigService {
  return {
    getOrThrow: jest.fn(() => SEGREDO_DE_TESTE),
  } as unknown as ConfigService;
}

// ---------------------------------------------
// PagamentosService contra Postgres real
// Fase mais sensível do roadmap: assinatura de webhook, idempotência de
// evento e transição de estado sob concorrência. Os três cenários que uma
// suíte unitária com mock não provaria de verdade — lock pessimista
// serializando, INSERT como trava de idempotência, e a corrida entre dois
// pagamentos pelo mesmo pedido — só fazem sentido contra banco real.
// ---------------------------------------------
describe('PagamentosService (integração)', () => {
  let conexao: DataSource;
  let pedidosService: PedidosService;
  let enderecosService: EnderecosService;
  let pagamentosService: PagamentosService;
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
    pagamentosService = new PagamentosService(
      conexao.getRepository(Pedido),
      configMock(),
    );

    const repositorioDeUsuarios = conexao.getRepository(Usuario);
    usuario = await repositorioDeUsuarios.save(
      repositorioDeUsuarios.create({
        email: 'comprador-pagamento@exemplo.local',
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

  async function criarPedidoPendente(): Promise<Pedido> {
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
    return pedidosService.criar(
      {
        enderecoId: endereco.id,
        modalidadeDeFrete: 'PAC',
        itens: [{ produtoId: produto.id, quantidade: 1 }],
      },
      usuarioPublico,
    );
  }

  describe('fluxo feliz', () => {
    it('cartão aprovado move o pedido para PAGO', async () => {
      const pedido = await criarPedidoPendente();

      const pagamento = await pagamentosService.criarIntencao(
        pedido.id,
        usuarioPublico,
        { numeroDoCartao: CARTAO_APROVADO },
      );

      expect(pagamento.status).toBe(SituacaoDoPagamento.APROVADO);
      expect(pagamento.ultimosDigitosDoCartao).toBe('1111');

      const pedidoRecarregado = await pedidosService.buscarPorId(
        pedido.id,
        usuarioPublico,
      );
      expect(pedidoRecarregado.situacao).toBe(SituacaoDoPedido.PAGO);
    });

    it('cartão recusado mantém o pedido PENDENTE e permite tentar de novo', async () => {
      const pedido = await criarPedidoPendente();

      const recusado = await pagamentosService.criarIntencao(
        pedido.id,
        usuarioPublico,
        { numeroDoCartao: CARTAO_RECUSADO },
      );
      expect(recusado.status).toBe(SituacaoDoPagamento.RECUSADO);
      expect(recusado.motivoDeRecusa).not.toBeNull();

      const pedidoAindaPendente = await pedidosService.buscarPorId(
        pedido.id,
        usuarioPublico,
      );
      expect(pedidoAindaPendente.situacao).toBe(SituacaoDoPedido.PENDENTE);

      // tenta de novo com outro cartão — precisa funcionar
      const aprovado = await pagamentosService.criarIntencao(
        pedido.id,
        usuarioPublico,
        { numeroDoCartao: CARTAO_APROVADO },
      );
      expect(aprovado.status).toBe(SituacaoDoPagamento.APROVADO);

      const historico = await pagamentosService.listarPorPedido(
        pedido.id,
        usuarioPublico,
      );
      expect(historico).toHaveLength(2);
    });
  });

  describe('falha entre a criação da tentativa e a confirmação', () => {
    it('resolve a tentativa como recusada em vez de deixá-la PENDENTE órfã', async () => {
      const pedido = await criarPedidoPendente();
      const espiao = jest
        .spyOn(pagamentosService, 'processarWebhook')
        .mockRejectedValueOnce(new Error('falha simulada de infraestrutura'));

      const pagamento = await pagamentosService.criarIntencao(
        pedido.id,
        usuarioPublico,
        { numeroDoCartao: CARTAO_APROVADO },
      );

      expect(pagamento.status).toBe(SituacaoDoPagamento.RECUSADO);
      expect(pagamento.motivoDeRecusa).toMatch(/tente novamente/i);

      const pedidoRecarregado = await pedidosService.buscarPorId(
        pedido.id,
        usuarioPublico,
      );
      expect(pedidoRecarregado.situacao).toBe(SituacaoDoPedido.PENDENTE);

      espiao.mockRestore();

      const retry = await pagamentosService.criarIntencao(
        pedido.id,
        usuarioPublico,
        { numeroDoCartao: CARTAO_APROVADO },
      );
      expect(retry.status).toBe(SituacaoDoPagamento.APROVADO);
    });
  });

  describe('regras de posse e de estado', () => {
    it('recusa iniciar pagamento de pedido de outro usuário (404, não 403)', async () => {
      const pedido = await criarPedidoPendente();
      const outroUsuario: UsuarioPublico = {
        ...usuarioPublico,
        id: '00000000-0000-0000-0000-000000000000',
      };

      await expect(
        pagamentosService.criarIntencao(pedido.id, outroUsuario, {
          numeroDoCartao: CARTAO_APROVADO,
        }),
      ).rejects.toThrow(/não encontrado/);
    });

    it('recusa pagar um pedido que já não está PENDENTE', async () => {
      const pedido = await criarPedidoPendente();
      await pagamentosService.criarIntencao(pedido.id, usuarioPublico, {
        numeroDoCartao: CARTAO_APROVADO,
      });

      await expect(
        pagamentosService.criarIntencao(pedido.id, usuarioPublico, {
          numeroDoCartao: CARTAO_APROVADO,
        }),
      ).rejects.toThrow(ConflictException);
    });

    // Achado de revisão adversarial (2026-09-10): enquanto PENDENTE -> PAGO
    // existisse como transição manual, todo o módulo de pagamento — assinatura,
    // idempotência, decisão do provedor — podia ser contornado por um PATCH de
    // ADMIN. Este teste é a trava contra a regra voltar por engano.
    it('nem ADMIN consegue marcar um pedido como PAGO por PATCH — só o webhook paga', async () => {
      const pedido = await criarPedidoPendente();
      const admin: UsuarioPublico = { ...usuarioPublico, papel: Papel.ADMIN };

      await expect(
        pedidosService.atualizarSituacao(
          pedido.id,
          { situacao: SituacaoDoPedido.PAGO },
          admin,
        ),
      ).rejects.toThrow();

      const pedidoRecarregado = await pedidosService.buscarPorId(
        pedido.id,
        usuarioPublico,
      );
      expect(pedidoRecarregado.situacao).toBe(SituacaoDoPedido.PENDENTE);
    });
  });

  describe('webhook — assinatura e replay', () => {
    async function criarPagamentoPendenteBruto(): Promise<{
      pedido: Pedido;
      pagamento: Pagamento;
    }> {
      const pedido = await criarPedidoPendente();
      const pagamento = await conexao.getRepository(Pagamento).save(
        conexao.getRepository(Pagamento).create({
          pedidoId: pedido.id,
          status: SituacaoDoPagamento.PENDENTE,
          ultimosDigitosDoCartao: '1111',
          motivoDeRecusa: null,
        }),
      );
      return { pedido, pagamento };
    }

    it('rejeita evento sem assinatura', async () => {
      const { pedido, pagamento } = await criarPagamentoPendenteBruto();
      const dto = {
        eventId: '11111111-1111-4111-8111-111111111111',
        pagamentoId: pagamento.id,
        pedidoId: pedido.id,
        status: 'APROVADO' as const,
        timestamp: Date.now(),
      };

      await expect(
        pagamentosService.processarWebhook(dto, undefined),
      ).rejects.toThrow(UnauthorizedException);

      const pagamentoIntacto = await conexao
        .getRepository(Pagamento)
        .findOneByOrFail({ id: pagamento.id });
      expect(pagamentoIntacto.status).toBe(SituacaoDoPagamento.PENDENTE);
    });

    it('rejeita evento com assinatura forjada — pedido não é aprovado', async () => {
      const { pedido, pagamento } = await criarPagamentoPendenteBruto();
      const dto = {
        eventId: '22222222-2222-4222-8222-222222222222',
        pagamentoId: pagamento.id,
        pedidoId: pedido.id,
        status: 'APROVADO' as const,
        timestamp: Date.now(),
      };

      await expect(
        pagamentosService.processarWebhook(dto, 'assinatura-forjada-por-um-atacante'),
      ).rejects.toThrow(UnauthorizedException);

      const pedidoIntacto = await pedidosService.buscarPorId(
        pedido.id,
        usuarioPublico,
      );
      expect(pedidoIntacto.situacao).toBe(SituacaoDoPedido.PENDENTE);
    });

    it('rejeita evento assinado corretamente mas expirado (replay)', async () => {
      const { pedido, pagamento } = await criarPagamentoPendenteBruto();
      const evento: EventoDePagamento = {
        eventId: '33333333-3333-4333-8333-333333333333',
        pagamentoId: pagamento.id,
        pedidoId: pedido.id,
        status: 'APROVADO',
        timestamp: Date.now() - 10 * 60 * 1000, // 10 minutos atrás, fora da janela de 5
      };
      const assinatura = assinarEvento(evento, SEGREDO_DE_TESTE);

      await expect(
        pagamentosService.processarWebhook(evento, assinatura),
      ).rejects.toThrow(BadRequestException);

      const pedidoIntacto = await pedidosService.buscarPorId(
        pedido.id,
        usuarioPublico,
      );
      expect(pedidoIntacto.situacao).toBe(SituacaoDoPedido.PENDENTE);
    });

    it('reentrega do mesmo evento é idempotente — processa uma vez só', async () => {
      const { pedido, pagamento } = await criarPagamentoPendenteBruto();
      const evento: EventoDePagamento = {
        eventId: '44444444-4444-4444-8444-444444444444',
        pagamentoId: pagamento.id,
        pedidoId: pedido.id,
        status: 'APROVADO',
        timestamp: Date.now(),
      };
      const assinatura = assinarEvento(evento, SEGREDO_DE_TESTE);

      await pagamentosService.processarWebhook(evento, assinatura);
      // reentrega idêntica — provedor real reenvia em timeout de resposta
      await pagamentosService.processarWebhook(evento, assinatura);

      const eventosRegistrados = await conexao
        .getRepository(EventoDeWebhookProcessado)
        .find({ where: { pagamentoId: pagamento.id } });
      expect(eventosRegistrados).toHaveLength(1);

      const pedidoFinal = await pedidosService.buscarPorId(
        pedido.id,
        usuarioPublico,
      );
      expect(pedidoFinal.situacao).toBe(SituacaoDoPedido.PAGO);
    });

    it('não ressuscita para PAGO um pedido cancelado enquanto o webhook estava em voo', async () => {
      // ---------------------------------------------
      // História real de como este teste chegou nesta forma, porque a lição
      // vale mais que o resultado:
      //
      // 1ª e 2ª tentativas (ver histórico completo no CLAUDE.md do backend,
      // seção Pagamentos): provavam bloqueio genérico do Postgres ou do
      // FK-check no INSERT de "payments", nunca o lock que o método
      // realmente usa.
      //
      // 3ª tentativa: isolei o INSERT (pagamentos pré-criados fora da
      // barreira) e medi só o tempo até processarWebhook resolver. Ainda
      // bloqueava com o `lock` do SELECT comentado. Investigando com
      // `pg_stat_activity`: o que estava esperando era o UPDATE final em
      // "orders" (`manager.save(pedido)`), preso num wait_event
      // "transactionid" — e ISSO acontece em qualquer UPDATE contra uma
      // linha que outra transação já travou com FOR UPDATE, COM ou SEM o
      // meu próprio SELECT pedir lock. Ou seja: o tempo de espera nunca foi
      // prova de nada — um UPDATE bloqueia de qualquer jeito.
      //
      // O que o `lock: { mode: 'pessimistic_write' }` no SELECT realmente
      // compra não é bloqueio — é FRESCOR: ele faz a LEITURA esperar a
      // liberação e reler o valor atual, em vez de decidir com um valor que
      // pode já estar desatualizado quando o UPDATE finalmente rodar. Sem
      // o lock na leitura, o código lê PENDENTE (verdadeiro no instante da
      // leitura), decide aprovar, e só o UPDATE (não a leitura) fica preso
      // esperando a outra transação — quando ela libera, o UPDATE roda
      // baseado na decisão TOMADA COM DADO VELHO, sobrescrevendo qualquer
      // mudança real que tenha acontecido nesse meio-tempo.
      //
      // Este teste prova exatamente essa falha: cancela o pedido enquanto
      // o webhook de aprovação está pendurado, e confirma que o resultado
      // final não pode ser um pedido CANCELADO reescrito para PAGO.
      // ---------------------------------------------
      const pedido = await criarPedidoPendente();
      const repositorioDePagamentos = conexao.getRepository(Pagamento);
      const pagamento = await repositorioDePagamentos.save(
        repositorioDePagamentos.create({
          pedidoId: pedido.id,
          status: SituacaoDoPagamento.PENDENTE,
          ultimosDigitosDoCartao: '1111',
          motivoDeRecusa: null,
        }),
      );

      const conexaoExterna = conexao.createQueryRunner();
      await conexaoExterna.connect();
      await conexaoExterna.startTransaction();

      try {
        await conexaoExterna.manager.findOne(Pedido, {
          where: { id: pedido.id },
          lock: { mode: 'pessimistic_write' },
        });

        const evento: EventoDePagamento = {
          eventId: '55555555-5555-4555-8555-555555555555',
          pagamentoId: pagamento.id,
          pedidoId: pedido.id,
          status: 'APROVADO',
          timestamp: Date.now(),
        };

        // webhook de aprovação em voo, com a linha do pedido travada por fora
        const chamadaReal = pagamentosService.processarWebhook(
          evento,
          assinarEvento(evento, SEGREDO_DE_TESTE),
        );

        // Atraso deliberado antes de cancelar por fora: dá tempo de sobra
        // para uma leitura SEM lock (código com o bug) já ter acontecido —
        // sem essa espera, a ordem real das duas operações fica sujeita à
        // sorte do event loop, e o teste voltaria a ser não-determinístico
        // (mesma armadilha já documentada nas tentativas anteriores). Com o
        // lock presente, a leitura de processarWebhook fica bloqueada
        // durante todo este intervalo e só acontece depois do commit
        // abaixo — é exatamente essa diferença de ORDEM, não de duração,
        // que o teste verifica.
        await new Promise((resolve) => setTimeout(resolve, 150));

        // o pedido é cancelado por outro caminho (usando a MESMA
        // conexão/transação que segura o lock, simulando uma ação
        // administrativa concorrente)
        await conexaoExterna.manager.update(
          Pedido,
          { id: pedido.id },
          { situacao: SituacaoDoPedido.CANCELADO },
        );
        await conexaoExterna.commitTransaction();

        await chamadaReal;
      } finally {
        await conexaoExterna.release();
      }

      const pedidoFinal = await pedidosService.buscarPorId(
        pedido.id,
        usuarioPublico,
      );
      // o cancelamento precisa vencer — aprovar um pagamento não pode
      // ressuscitar um pedido que já foi cancelado no meio do caminho
      expect(pedidoFinal.situacao).toBe(SituacaoDoPedido.CANCELADO);

      const pagamentoFinal = await repositorioDePagamentos.findOneByOrFail({
        id: pagamento.id,
      });
      expect(pagamentoFinal.status).toBe(SituacaoDoPagamento.RECUSADO);
    });

    it('depois de aprovado, uma segunda tentativa de pagamento é recusada (não paga duas vezes)', async () => {
      const pedido = await criarPedidoPendente();

      await pagamentosService.criarIntencao(pedido.id, usuarioPublico, {
        numeroDoCartao: CARTAO_APROVADO,
      });

      await expect(
        pagamentosService.criarIntencao(pedido.id, usuarioPublico, {
          numeroDoCartao: '4222222222222222',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
