import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import {
  Paginado,
  resolverPaginacao,
  paraPaginado,
} from '../../common/dto/paginado';
import { ConsultaPaginadaDto } from '../../common/dto/consulta-paginada.dto';
import { Categoria } from './categoria.entity';
import { CriarCategoriaDto } from './dto/criar-categoria.dto';
import { AtualizarCategoriaDto } from './dto/atualizar-categoria.dto';
import { Produto } from '../produtos/produto.entity';

function ehViolacaoDeChaveEstrangeira(erro: unknown): boolean {
  return (
    erro instanceof QueryFailedError &&
    (erro.driverError as Error & { code?: string }).code === '23503'
  );
}

@Injectable()
export class CategoriasService {
  constructor(
    @InjectRepository(Categoria)
    private readonly repositorioDeCategorias: Repository<Categoria>,
  ) {}

  // ---------------------------------------------
  // Listagem paginada de categorias
  // A ordenação por id é obrigatória, não estética: sem ORDER BY o Postgres
  // não garante ordem entre consultas, e a mesma categoria poderia aparecer
  // em duas páginas ou sumir de todas conforme o plano de execução mudasse.
  // ---------------------------------------------
  async listar(query: ConsultaPaginadaDto): Promise<Paginado<Categoria>> {
    const { pagina, limite, skip, take } = resolverPaginacao(query);
    const [dados, total] = await this.repositorioDeCategorias.findAndCount({
      order: { id: 'ASC' },
      skip,
      take,
    });
    return paraPaginado(dados, total, pagina, limite);
  }

  // ---------------------------------------------
  // Consulta de categoria por identificador
  // ---------------------------------------------
  async buscarPorId(id: number): Promise<Categoria> {
    const categoria = await this.repositorioDeCategorias.findOneBy({ id });
    if (!categoria) {
      throw new NotFoundException(`Categoria ${id} não encontrada`);
    }
    return categoria;
  }

  // ---------------------------------------------
  // Criação de categoria
  // ---------------------------------------------
  criar(dto: CriarCategoriaDto): Promise<Categoria> {
    const categoria = this.repositorioDeCategorias.create(dto);
    return this.repositorioDeCategorias.save(categoria);
  }

  // ---------------------------------------------
  // Atualização de categoria
  // Campo ausente no DTO preserva o valor atual: o Object.assign só sobrescreve
  // o que veio na requisição, espelhando o comportamento de produtos.
  // ---------------------------------------------
  async atualizar(id: number, dto: AtualizarCategoriaDto): Promise<Categoria> {
    const categoria = await this.buscarPorId(id);
    Object.assign(categoria, dto);
    return this.repositorioDeCategorias.save(categoria);
  }

  // ---------------------------------------------
  // Remoção com checagem de produtos
  // A checagem explícita devolve um conflito de domínio antes que a chave
  // estrangeira rejeite a exclusão com um erro de infraestrutura.
  // ---------------------------------------------
  async remover(id: number): Promise<void> {
    const categoria = await this.buscarPorId(id);
    const productsCount = await this.repositorioDeCategorias.manager.countBy(
      Produto,
      { categoriaId: id },
    );
    if (productsCount > 0) {
      throw new ConflictException(
        `Não é possível remover a categoria ${id}: existem produtos vinculados a ela`,
      );
    }
    try {
      await this.repositorioDeCategorias.remove(categoria);
    } catch (erro) {
      if (ehViolacaoDeChaveEstrangeira(erro)) {
        throw new ConflictException(
          `Não é possível remover a categoria ${id}: existem produtos vinculados a ela`,
        );
      }
      throw erro;
    }
  }
}
