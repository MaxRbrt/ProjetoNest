import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Endereco } from '../../src/modules/enderecos/endereco.entity';
import { EnderecosService } from '../../src/modules/enderecos/enderecos.service';
import { Papel, Usuario } from '../../src/modules/usuarios/usuario.entity';
import { abrirBancoDeTeste, fecharBancoDeTeste, limparTabelas } from './ambiente';

// ---------------------------------------------
// EnderecosService contra Postgres real
// O invariante "no máximo um principal por usuário" é aplicado por
// transação, não por constraint de banco — não daria para provar isso com um
// fake de EntityManager sem reimplementar a própria transação dentro do
// fake. Aqui é o serviço real contra tabelas reais.
// ---------------------------------------------
describe('EnderecosService (integração)', () => {
  let conexao: DataSource;
  let servico: EnderecosService;
  let usuarioA: Usuario;
  let usuarioB: Usuario;

  beforeAll(async () => {
    conexao = await abrirBancoDeTeste();
  });

  afterAll(async () => {
    await fecharBancoDeTeste();
  });

  beforeEach(async () => {
    await limparTabelas(conexao);
    servico = new EnderecosService(conexao.getRepository(Endereco));

    const repositorioDeUsuarios = conexao.getRepository(Usuario);
    usuarioA = await repositorioDeUsuarios.save(
      repositorioDeUsuarios.create({
        email: 'dono-endereco@exemplo.local',
        hashDaSenha: 'hash-irrelevante',
        papel: Papel.CLIENTE,
        emailVerificadoEm: new Date(),
        tentativasDeLoginFalhas: 0,
        bloqueadoAte: null,
      }),
    );
    usuarioB = await repositorioDeUsuarios.save(
      repositorioDeUsuarios.create({
        email: 'intruso-endereco@exemplo.local',
        hashDaSenha: 'hash-irrelevante',
        papel: Papel.CLIENTE,
        emailVerificadoEm: new Date(),
        tentativasDeLoginFalhas: 0,
        bloqueadoAte: null,
      }),
    );
  });

  function dadosDeEndereco(sobrescreve: Partial<Record<string, unknown>> = {}) {
    return {
      apelido: 'Casa',
      destinatario: 'Fulano de Tal',
      cep: '01310100',
      logradouro: 'Av. Paulista',
      numero: '1000',
      bairro: 'Bela Vista',
      cidade: 'São Paulo',
      uf: 'SP' as const,
      ...sobrescreve,
    };
  }

  it('o primeiro endereço do usuário nasce principal mesmo sem pedir', async () => {
    const endereco = await servico.criar(usuarioA.id, dadosDeEndereco());
    expect(endereco.principal).toBe(true);
  });

  it('marcar um segundo endereço como principal desmarca o primeiro', async () => {
    const primeiro = await servico.criar(usuarioA.id, dadosDeEndereco());
    const segundo = await servico.criar(
      usuarioA.id,
      dadosDeEndereco({ apelido: 'Trabalho', principal: true }),
    );

    const primeiroRecarregado = await servico.buscarPorId(
      primeiro.id,
      usuarioA.id,
    );
    expect(primeiroRecarregado.principal).toBe(false);
    expect(segundo.principal).toBe(true);
  });

  it('nunca existe mais de um principal, mesmo criando vários em sequência', async () => {
    await servico.criar(usuarioA.id, dadosDeEndereco({ apelido: 'Um' }));
    await servico.criar(
      usuarioA.id,
      dadosDeEndereco({ apelido: 'Dois', principal: true }),
    );
    await servico.criar(
      usuarioA.id,
      dadosDeEndereco({ apelido: 'Três', principal: true }),
    );

    const todos = await servico.listar(usuarioA.id);
    const principais = todos.filter((e) => e.principal);
    expect(principais).toHaveLength(1);
    expect(principais[0].apelido).toBe('Três');
  });

  it('mantém um único principal quando dois endereços são criados ao mesmo tempo', async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, indice) =>
        servico.criar(
          usuarioA.id,
          dadosDeEndereco({ apelido: `Endereço ${indice}` }),
        ),
      ),
    );

    const principais = (await servico.listar(usuarioA.id)).filter(
      (endereco) => endereco.principal,
    );

    expect(principais).toHaveLength(1);
  });

  it('o banco rejeita dois endereços principais para o mesmo usuário', async () => {
    await servico.criar(usuarioA.id, dadosDeEndereco({ apelido: 'Primeiro' }));

    await expect(
      conexao.getRepository(Endereco).save(
        conexao.getRepository(Endereco).create({
          ...dadosDeEndereco({ apelido: 'Segundo' }),
          usuarioId: usuarioA.id,
          principal: true,
          complemento: null,
        }),
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('remover o endereço principal promove o mais recente restante', async () => {
    const primeiro = await servico.criar(usuarioA.id, dadosDeEndereco({ apelido: 'Um' }));
    const segundo = await servico.criar(usuarioA.id, dadosDeEndereco({ apelido: 'Dois' }));

    await servico.remover(primeiro.id, usuarioA.id);

    const restante = await servico.buscarPorId(segundo.id, usuarioA.id);
    expect(restante.principal).toBe(true);
  });

  it('endereço de outro usuário devolve 404, não 403', async () => {
    const enderecoDeA = await servico.criar(usuarioA.id, dadosDeEndereco());

    await expect(
      servico.buscarPorId(enderecoDeA.id, usuarioB.id),
    ).rejects.toThrow(NotFoundException);
  });

  it('atualizar endereço de outro usuário devolve 404', async () => {
    const enderecoDeA = await servico.criar(usuarioA.id, dadosDeEndereco());

    await expect(
      servico.atualizar(enderecoDeA.id, usuarioB.id, { apelido: 'Invadido' }),
    ).rejects.toThrow(NotFoundException);

    const aindaIntacto = await servico.buscarPorId(enderecoDeA.id, usuarioA.id);
    expect(aindaIntacto.apelido).toBe('Casa');
  });

  it('remover endereço de outro usuário devolve 404 e não remove nada', async () => {
    const enderecoDeA = await servico.criar(usuarioA.id, dadosDeEndereco());

    await expect(
      servico.remover(enderecoDeA.id, usuarioB.id),
    ).rejects.toThrow(NotFoundException);

    await expect(
      servico.buscarPorId(enderecoDeA.id, usuarioA.id),
    ).resolves.toBeDefined();
  });
});
