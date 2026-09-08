import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import {
  Paginado,
  resolverPaginacao,
  paraPaginado,
} from '../../common/dto/paginado';
import { Produto } from './produto.entity';
import { CriarProdutoDto } from './dto/criar-produto.dto';
import { ConsultaDeProdutosDto } from './dto/consulta-de-produtos.dto';
import { AtualizarProdutoDto } from './dto/atualizar-produto.dto';
import { CategoriasService } from '../categorias/categorias.service';
import { ItemDoPedido } from '../pedidos/entities/item-do-pedido.entity';

@Injectable()
export class ProdutosService {
  constructor(
    @InjectRepository(Produto)
    private readonly repositorioDeProdutos: Repository<Produto>,
    private readonly categoriasService: CategoriasService,
  ) {}

  // ---------------------------------------------
  // Listagem paginada de produtos, com filtro e busca
  // Os filtros entram no where e não em memória: filtrar depois de paginar
  // devolveria página incompleta e um total que não corresponde ao resultado.
  // Nome em branco é tratado como filtro ausente, para que um campo de busca
  // vazio na vitrine não vire uma busca por espaço. A ordenação por id é
  // obrigatória: sem ORDER BY o Postgres não garante ordem entre consultas, e
  // o mesmo produto poderia aparecer em duas páginas ou sumir de todas.
  // ---------------------------------------------
  async listar(query: ConsultaDeProdutosDto): Promise<Paginado<Produto>> {
    const { pagina, limite, skip, take } = resolverPaginacao(query);
    const where: FindOptionsWhere<Produto> = {};

    if (query.categoriaId !== undefined) {
      where.categoriaId = query.categoriaId;
    }
    const nome = query.nome?.trim();
    if (nome) {
      where.nome = ILike(`%${nome}%`);
    }

    const [dados, total] = await this.repositorioDeProdutos.findAndCount({
      where,
      order: { id: 'ASC' },
      skip,
      take,
    });
    return paraPaginado(dados, total, pagina, limite);
  }

  // ---------------------------------------------
  // Consulta de produto por identificador
  // ---------------------------------------------
  async buscarPorId(id: number): Promise<Produto> {
    const produto = await this.repositorioDeProdutos.findOneBy({ id });
    if (!produto) {
      throw new NotFoundException(`Produto ${id} não encontrado`);
    }
    return produto;
  }

  // ---------------------------------------------
  // Criação de produto
  // ---------------------------------------------
  async criar(dto: CriarProdutoDto): Promise<Produto> {
    await this.categoriasService.buscarPorId(dto.categoriaId);
    const produto = this.repositorioDeProdutos.create(dto);
    return this.repositorioDeProdutos.save(produto);
  }

  // ---------------------------------------------
  // Atualização de produto
  // ---------------------------------------------
  async atualizar(id: number, dto: AtualizarProdutoDto): Promise<Produto> {
    const produto = await this.buscarPorId(id);
    if (dto.categoriaId !== undefined) {
      await this.categoriasService.buscarPorId(dto.categoriaId);
    }
    Object.assign(produto, dto);
    return this.repositorioDeProdutos.save(produto);
  }

  // ---------------------------------------------
  // Remoção com checagem de pedidos
  // A checagem explícita converte a dependência em um conflito de negócio
  // compreensível antes de tentar violar a chave estrangeira.
  // ---------------------------------------------
  async remover(id: number): Promise<void> {
    const produto = await this.buscarPorId(id);
    const orderItemsCount = await this.repositorioDeProdutos.manager.countBy(
      ItemDoPedido,
      { produtoId: id },
    );
    if (orderItemsCount > 0) {
      throw new ConflictException(
        `Não é possível remover o produto ${id}: existem pedidos vinculados a ele`,
      );
    }
    await this.repositorioDeProdutos.remove(produto);
  }
}
