import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { Role } from '../usuarios/entities/user.entity';
import { PublicUser } from '../usuarios/users.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { Order, OrderStatus } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Product } from '../produtos/entities/product.entity';
import { hashOrderPayload, OrdersService } from './orders.service';

describe('Serviço de pedidos', () => {
  const cliente: PublicUser = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'cliente@example.com',
    isEmailVerified: true,
    createdAt: new Date('2026-08-27T09:00:00Z'),
    role: Role.CLIENTE,
  };
  const admin: PublicUser = {
    ...cliente,
    id: '22222222-2222-4222-8222-222222222222',
    role: Role.ADMIN,
  };

  let repository: {
    find: jest.Mock;
    findAndCount: jest.Mock;
    findOne: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let service: OrdersService;

  beforeEach(() => {
    repository = {
      find: jest.fn(),
      findAndCount: jest.fn(),
      findOne: jest.fn(),
      manager: { transaction: jest.fn() },
    };
    service = new OrdersService(repository as unknown as Repository<Order>);
  });

  // ---------------------------------------------
  // Listagem conforme o papel do usuário
  // ---------------------------------------------
  it('lista apenas os pedidos do próprio cliente', async () => {
    repository.findAndCount.mockResolvedValue([[], 0]);

    await service.findAll(cliente, {});

    expect(repository.findAndCount).toHaveBeenCalledWith({
      where: { userId: cliente.id },
      relations: { items: true },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: 0,
      take: 20,
    });
  });

  it('lista todos os pedidos para administrador', async () => {
    repository.findAndCount.mockResolvedValue([[], 0]);

    await service.findAll(admin, {});

    expect(repository.findAndCount).toHaveBeenCalledWith({
      where: {},
      relations: { items: true },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: 0,
      take: 20,
    });
  });

  it('devolve o envelope paginado com total e página pedida', async () => {
    const pedido = Object.assign(new Order(), { id: 5 });
    repository.findAndCount.mockResolvedValue([[pedido], 37]);

    const result = await service.findAll(cliente, { page: 2, limit: 10 });

    expect(result).toEqual({ data: [pedido], total: 37, page: 2, limit: 10 });
    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });

  it('nunca deixa o cliente paginar sobre pedidos alheios', async () => {
    // O filtro de dono precisa estar no where junto com skip/take: paginar
    // primeiro e filtrar depois vazaria a contagem de pedidos de outros.
    repository.findAndCount.mockResolvedValue([[], 0]);

    await service.findAll(cliente, { page: 3 });

    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: cliente.id } }),
    );
  });

  // ---------------------------------------------
  // Consulta protegida pela titularidade
  // ---------------------------------------------
  it('restringe a consulta por id ao dono quando é cliente', async () => {
    repository.findOne.mockResolvedValue(Object.assign(new Order(), { id: 7 }));

    await service.findOne(7, cliente);

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 7, userId: cliente.id },
      relations: { items: true },
    });
  });

  it('consulta pedido de administrador usando apenas o identificador', async () => {
    repository.findOne.mockResolvedValue(Object.assign(new Order(), { id: 7 }));

    await service.findOne(7, admin);

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 7 },
      relations: { items: true },
    });
  });

  it('devolve 404 e não 403 para pedido de outro usuário', async () => {
    // A consulta já filtra por dono, então pedido alheio simplesmente não é
    // encontrado. Um 403 confirmaria que o pedido existe e permitiria enumerar.
    repository.findOne.mockResolvedValue(null);

    await expect(service.findOne(7, cliente)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // ---------------------------------------------
  // Criação vinculada ao usuário autenticado
  // ---------------------------------------------
  it('define o dono pelo usuário autenticado e ignora dono enviado no DTO', async () => {
    const dto = {
      items: [{ productId: 10, quantity: 2 }],
      userId: '33333333-3333-4333-8333-333333333333',
    } as CreateOrderDto & { userId: string };
    const product = Object.assign(new Product(), {
      id: 10,
      name: 'Produto',
      price: 15,
      stock: 5,
    });
    const order = Object.assign(new Order(), { id: 1 });
    const manager = {
      findOne: jest.fn().mockResolvedValue(product),
      save: jest.fn().mockImplementation((entity: unknown) => entity),
      create: jest.fn().mockReturnValue(order),
    };
    repository.manager.transaction.mockImplementation(
      (operation: (entityManager: typeof manager) => Promise<Order>) =>
        operation(manager),
    );

    await service.create(dto, cliente);

    expect(manager.create).toHaveBeenCalledWith(Order, {
      total: 30,
      items: [expect.objectContaining({ productId: 10, quantity: 2 })],
      userId: cliente.id,
      idempotencyKey: null,
      payloadHash: null,
    });
  });

  // ---------------------------------------------
  // Registro histórico do item comprado
  // Nome e preço são copiados para o item no momento da compra. Sem isso o
  // pedido antigo passaria a exibir o preço atual do produto, e um produto
  // removido deixaria o item sem identificação nenhuma.
  // ---------------------------------------------
  it('congela nome e preço do produto no item do pedido', async () => {
    const dto: CreateOrderDto = { items: [{ productId: 10, quantity: 2 }] };
    const product = Object.assign(new Product(), {
      id: 10,
      name: 'Caneca Azul',
      price: 15,
      stock: 5,
    });
    const manager = {
      findOne: jest.fn().mockResolvedValue(product),
      save: jest.fn().mockImplementation((entity: unknown) => entity),
      create: jest.fn().mockReturnValue(new Order()),
    };
    repository.manager.transaction.mockImplementation(
      (operation: (entityManager: typeof manager) => Promise<Order>) =>
        operation(manager),
    );

    await service.create(dto, cliente);

    expect(manager.create).toHaveBeenCalledWith(
      Order,
      expect.objectContaining({
        items: [
          expect.objectContaining({
            productId: 10,
            quantity: 2,
            productName: 'Caneca Azul',
            unitPrice: 15,
          }),
        ],
      }),
    );
  });

  it('mantém o preço registrado mesmo que o produto mude de preço depois', async () => {
    const dto: CreateOrderDto = { items: [{ productId: 10, quantity: 1 }] };
    const product = Object.assign(new Product(), {
      id: 10,
      name: 'Caneca Azul',
      price: 15,
      stock: 5,
    });
    const manager = {
      findOne: jest.fn().mockResolvedValue(product),
      save: jest.fn().mockImplementation((entity: unknown) => entity),
      create: jest.fn().mockReturnValue(new Order()),
    };
    repository.manager.transaction.mockImplementation(
      (operation: (entityManager: typeof manager) => Promise<Order>) =>
        operation(manager),
    );

    await service.create(dto, cliente);
    const itemGravado = (
      manager.create.mock.calls[0][1] as { items: OrderItem[] }
    ).items[0];

    product.price = 99;

    expect(itemGravado.unitPrice).toBe(15);
  });

  // ---------------------------------------------
  // Idempotência de criação (Idempotency-Key)
  // ---------------------------------------------
  const dto: CreateOrderDto = { items: [{ productId: 10, quantity: 2 }] };

  function mockCreateFlow() {
    const product = Object.assign(new Product(), {
      id: 10,
      name: 'Produto',
      price: 15,
      stock: 5,
    });
    const order = Object.assign(new Order(), { id: 1 });
    const manager = {
      findOne: jest.fn().mockResolvedValue(product),
      save: jest.fn().mockImplementation((entity: unknown) => entity),
      create: jest.fn().mockReturnValue(order),
    };
    repository.manager.transaction.mockImplementation(
      (operation: (entityManager: typeof manager) => Promise<Order>) =>
        operation(manager),
    );
    return { manager, order };
  }

  it('grava idempotencyKey e o hash do payload quando o cabeçalho é enviado', async () => {
    repository.findOne.mockResolvedValue(null);
    const { manager } = mockCreateFlow();

    await service.create(dto, cliente, 'chave-abc');

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { userId: cliente.id, idempotencyKey: 'chave-abc' },
      relations: { items: true },
    });
    expect(manager.create).toHaveBeenCalledWith(Order, {
      total: 30,
      items: [expect.objectContaining({ productId: 10, quantity: 2 })],
      userId: cliente.id,
      idempotencyKey: 'chave-abc',
      payloadHash: hashOrderPayload(dto.items),
    });
  });

  it('devolve o pedido existente em vez de criar outro quando a chave repete o mesmo payload', async () => {
    const existing = Object.assign(new Order(), {
      id: 9,
      idempotencyKey: 'chave-abc',
      payloadHash: hashOrderPayload(dto.items),
    });
    repository.findOne.mockResolvedValue(existing);

    const result = await service.create(dto, cliente, 'chave-abc');

    expect(result).toBe(existing);
    expect(repository.manager.transaction).not.toHaveBeenCalled();
  });

  it('recusa com 409 quando a mesma chave é usada com um payload diferente', async () => {
    const existing = Object.assign(new Order(), {
      id: 9,
      idempotencyKey: 'chave-abc',
      payloadHash: 'hash-de-outro-pedido',
    });
    repository.findOne.mockResolvedValue(existing);

    await expect(
      service.create(dto, cliente, 'chave-abc'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.manager.transaction).not.toHaveBeenCalled();
  });

  it('resolve corrida de duas requisições concorrentes devolvendo o pedido do vencedor', async () => {
    // Nenhum pedido existente na primeira consulta: as duas requisições
    // concorrentes chegam aqui em paralelo. Só uma vence a restrição de
    // unicidade (userId, idempotencyKey) no insert; a outra recebe o erro
    // do Postgres e busca de novo para devolver o pedido que já foi salvo.
    const winner = Object.assign(new Order(), {
      id: 9,
      idempotencyKey: 'chave-abc',
      payloadHash: hashOrderPayload(dto.items),
    });
    repository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);
    const product = Object.assign(new Product(), {
      id: 10,
      name: 'Produto',
      price: 15,
      stock: 5,
    });
    const uniqueViolation = Object.assign(new Error('duplicate key'), {
      code: '23505',
    });
    const manager = {
      findOne: jest.fn().mockResolvedValue(product),
      // A baixa de estoque (save do Product) sucede normalmente; só o
      // insert do Order colide com o índice único — é isso que a corrida
      // real do Postgres faria, não uma falha genérica em qualquer save.
      save: jest
        .fn()
        .mockImplementation((entity: unknown) =>
          entity instanceof Order
            ? Promise.reject(uniqueViolation)
            : Promise.resolve(entity),
        ),
      create: jest.fn().mockReturnValue(new Order()),
    };
    repository.manager.transaction.mockImplementation(
      async (operation: (entityManager: typeof manager) => Promise<Order>) =>
        operation(manager),
    );

    const result = await service.create(dto, cliente, 'chave-abc');

    expect(result).toBe(winner);
    expect(repository.findOne).toHaveBeenCalledTimes(2);
  });

  it('sem Idempotency-Key, cria normalmente sem consultar nem gravar chave', async () => {
    const { manager } = mockCreateFlow();

    await service.create(dto, cliente);

    expect(repository.findOne).not.toHaveBeenCalled();
    expect(manager.create).toHaveBeenCalledWith(
      Order,
      expect.objectContaining({ idempotencyKey: null, payloadHash: null }),
    );
  });

  it('recusa Idempotency-Key vazia (só espaços) com 400 antes de qualquer consulta', async () => {
    await expect(service.create(dto, cliente, '   ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.findOne).not.toHaveBeenCalled();
  });

  it('recusa Idempotency-Key maior que 128 caracteres com 400 antes de qualquer consulta', async () => {
    const chaveLonga = 'a'.repeat(129);

    await expect(
      service.create(dto, cliente, chaveLonga),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.findOne).not.toHaveBeenCalled();
  });

  it('recusa pedido com o mesmo produto repetido no carrinho', async () => {
    const dtoDuplicado: CreateOrderDto = {
      items: [
        { productId: 10, quantity: 1 },
        { productId: 10, quantity: 2 },
      ],
    };

    await expect(service.create(dtoDuplicado, cliente)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.manager.transaction).not.toHaveBeenCalled();
  });

  // ---------------------------------------------
  // Ciclo de vida do pedido (status)
  // Monta a transação com o pedido no estado pedido e produtos para o
  // estorno, devolvendo os mocks para inspecionar lock, save e ordem.
  // ---------------------------------------------
  function mockStatusFlow(status: OrderStatus, userId = cliente.id) {
    const order = Object.assign(new Order(), { id: 5, status, userId });
    const items = [
      Object.assign(new OrderItem(), { productId: 20, quantity: 3 }),
      Object.assign(new OrderItem(), { productId: 10, quantity: 2 }),
    ];
    const produtos = new Map<number, Product>([
      [10, Object.assign(new Product(), { id: 10, name: 'A', stock: 1 })],
      [20, Object.assign(new Product(), { id: 20, name: 'B', stock: 4 })],
    ]);
    const manager = {
      findOne: jest.fn().mockImplementation((entity: unknown, options: any) => {
        if (entity === Order) return Promise.resolve(order);
        return Promise.resolve(produtos.get(options.where.id as number));
      }),
      findBy: jest.fn().mockResolvedValue(items),
      save: jest.fn().mockImplementation((entity: unknown) => entity),
    };
    repository.manager.transaction.mockImplementation(
      (operation: (entityManager: typeof manager) => Promise<Order>) =>
        operation(manager),
    );
    return { order, items, produtos, manager };
  }

  it('permite ao administrador marcar pedido pendente como pago', async () => {
    const { order } = mockStatusFlow(OrderStatus.PENDENTE);

    const result = await service.updateStatus(
      5,
      { status: OrderStatus.PAGO },
      admin,
    );

    expect(result.status).toBe(OrderStatus.PAGO);
  });

  it('recusa cliente marcando o próprio pedido como pago', async () => {
    mockStatusFlow(OrderStatus.PENDENTE);

    await expect(
      service.updateStatus(5, { status: OrderStatus.PAGO }, cliente),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite ao cliente cancelar o próprio pedido pendente', async () => {
    const { order } = mockStatusFlow(OrderStatus.PENDENTE);

    const result = await service.updateStatus(
      5,
      { status: OrderStatus.CANCELADO },
      cliente,
    );

    expect(result.status).toBe(OrderStatus.CANCELADO);
    expect(order.status).toBe(OrderStatus.CANCELADO);
  });

  it('estorna ao estoque a quantidade exata de cada item ao cancelar', async () => {
    const { produtos } = mockStatusFlow(OrderStatus.PENDENTE);

    await service.updateStatus(5, { status: OrderStatus.CANCELADO }, cliente);

    expect(produtos.get(10)!.stock).toBe(3);
    expect(produtos.get(20)!.stock).toBe(7);
  });

  it('trava os produtos do estorno em ordem crescente de productId', async () => {
    // Mesma ordem usada na criação: sem isso, cancelar e criar em paralelo
    // pediriam os bloqueios em ordens opostas e travariam em deadlock.
    const { manager } = mockStatusFlow(OrderStatus.PENDENTE);

    await service.updateStatus(5, { status: OrderStatus.CANCELADO }, cliente);

    const idsTravados = manager.findOne.mock.calls
      .filter((call) => call[0] === Product)
      .map((call) => (call[1] as { where: { id: number } }).where.id);
    expect(idsTravados).toEqual([10, 20]);
  });

  it('permite ao administrador cancelar pedido já pago', async () => {
    mockStatusFlow(OrderStatus.PAGO);

    const result = await service.updateStatus(
      5,
      { status: OrderStatus.CANCELADO },
      admin,
    );

    expect(result.status).toBe(OrderStatus.CANCELADO);
  });

  it('recusa cliente cancelando pedido já pago', async () => {
    mockStatusFlow(OrderStatus.PAGO);

    await expect(
      service.updateStatus(5, { status: OrderStatus.CANCELADO }, cliente),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('recusa qualquer transição a partir de pedido cancelado', async () => {
    mockStatusFlow(OrderStatus.CANCELADO);

    await expect(
      service.updateStatus(5, { status: OrderStatus.PAGO }, admin),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('recusa transição para o mesmo status atual', async () => {
    mockStatusFlow(OrderStatus.PENDENTE);

    await expect(
      service.updateStatus(5, { status: OrderStatus.PENDENTE }, admin),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('devolve 404 quando o pedido é de outro usuário', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      findBy: jest.fn(),
      save: jest.fn(),
    };
    repository.manager.transaction.mockImplementation(
      (operation: (entityManager: typeof manager) => Promise<Order>) =>
        operation(manager),
    );

    await expect(
      service.updateStatus(5, { status: OrderStatus.CANCELADO }, cliente),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('relê o pedido com lock de escrita dentro da transação', async () => {
    // Sem o lock, duas requisições concorrentes leriam o mesmo status
    // PENDENTE e as duas estornariam o estoque.
    const { manager } = mockStatusFlow(OrderStatus.PENDENTE);

    await service.updateStatus(5, { status: OrderStatus.CANCELADO }, cliente);

    const chamadaDoPedido = manager.findOne.mock.calls.find(
      (call) => call[0] === Order,
    );
    expect(chamadaDoPedido?.[1]).toMatchObject({
      lock: { mode: 'pessimistic_write' },
      where: { id: 5, userId: cliente.id },
    });
  });
});
