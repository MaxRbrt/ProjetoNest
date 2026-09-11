import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Endereco } from './endereco.entity';
import { CriarEnderecoDto } from './dto/criar-endereco.dto';
import { AtualizarEnderecoDto } from './dto/atualizar-endereco.dto';
import { Usuario } from '../usuarios/usuario.entity';

@Injectable()
export class EnderecosService {
  constructor(
    @InjectRepository(Endereco)
    private readonly repositorioDeEnderecos: Repository<Endereco>,
  ) {}

  // ---------------------------------------------
  // Listagem dos endereços do usuário
  // Principal primeiro, depois mais recente — é a ordem que a tela de
  // checkout quer para pré-selecionar sem precisar de outra consulta.
  // ---------------------------------------------
  listar(usuarioId: string): Promise<Endereco[]> {
    return this.repositorioDeEnderecos.find({
      where: { usuarioId },
      order: { principal: 'DESC', criadoEm: 'DESC' },
    });
  }

  // ---------------------------------------------
  // Consulta de endereço por identificador
  // Endereço alheio devolve 404, não 403 — mesma regra já usada em pedido: um
  // 403 confirmaria a existência do endereço para quem não é dono.
  // ---------------------------------------------
  async buscarPorId(id: number, usuarioId: string): Promise<Endereco> {
    const endereco = await this.repositorioDeEnderecos.findOne({
      where: { id, usuarioId },
    });
    if (!endereco) {
      throw new NotFoundException(`Endereço ${id} não encontrado`);
    }
    return endereco;
  }

  // ---------------------------------------------
  // Criação de endereço
  // O primeiro endereço do usuário nasce principal mesmo sem pedir: um
  // usuário sem nenhum endereço principal travaria o checkout, que depende
  // de ter um pré-selecionado.
  // ---------------------------------------------
  async criar(usuarioId: string, dto: CriarEnderecoDto): Promise<Endereco> {
    return this.repositorioDeEnderecos.manager.transaction(
      async (manager) => {
        await this.bloquearUsuario(manager, usuarioId);
        const repositorio = manager.getRepository(Endereco);
        const nenhumAinda =
          (await repositorio.count({ where: { usuarioId } })) === 0;
        const principal = dto.principal === true || nenhumAinda;

        if (principal) {
          await this.desmarcarPrincipais(manager.getRepository(Endereco), usuarioId);
        }

        const endereco = repositorio.create({
          ...dto,
          complemento: dto.complemento ?? null,
          usuarioId,
          principal,
        });
        return repositorio.save(endereco);
      },
    );
  }

  // ---------------------------------------------
  // Atualização de endereço
  // Marcar principal=true desmarca os demais na mesma transação; principal
  // nunca fica implicitamente false por uma atualização que não menciona o
  // campo (dto.principal undefined não entra no merge).
  // ---------------------------------------------
  async atualizar(
    id: number,
    usuarioId: string,
    dto: AtualizarEnderecoDto,
  ): Promise<Endereco> {
    return this.repositorioDeEnderecos.manager.transaction(
      async (manager) => {
        await this.bloquearUsuario(manager, usuarioId);
        const repositorio = manager.getRepository(Endereco);
        const endereco = await repositorio.findOne({
          where: { id, usuarioId },
        });
        if (!endereco) {
          throw new NotFoundException(`Endereço ${id} não encontrado`);
        }

        if (dto.principal === true && !endereco.principal) {
          await this.desmarcarPrincipais(repositorio, usuarioId);
        }

        Object.assign(endereco, dto);
        return repositorio.save(endereco);
      },
    );
  }

  // ---------------------------------------------
  // Remoção de endereço
  // Se o removido era o principal, promove o mais recente restante — sem
  // isso o usuário ficaria sem endereço principal até criar outro.
  // ---------------------------------------------
  async remover(id: number, usuarioId: string): Promise<void> {
    await this.repositorioDeEnderecos.manager.transaction(async (manager) => {
      await this.bloquearUsuario(manager, usuarioId);
      const repositorio = manager.getRepository(Endereco);
      const endereco = await repositorio.findOne({ where: { id, usuarioId } });
      if (!endereco) {
        throw new NotFoundException(`Endereço ${id} não encontrado`);
      }

      await repositorio.remove(endereco);

      if (endereco.principal) {
        const proximo = await repositorio.findOne({
          where: { usuarioId },
          order: { criadoEm: 'DESC' },
        });
        if (proximo) {
          proximo.principal = true;
          await repositorio.save(proximo);
        }
      }
    });
  }

  private async desmarcarPrincipais(
    repositorio: Repository<Endereco>,
    usuarioId: string,
  ): Promise<void> {
    await repositorio.update(
      { usuarioId, principal: true },
      { principal: false },
    );
  }

  private async bloquearUsuario(
    manager: EntityManager,
    usuarioId: string,
  ): Promise<void> {
    const usuario = await manager.findOne(Usuario, {
      where: { id: usuarioId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!usuario) {
      throw new NotFoundException(`Usuário ${usuarioId} não encontrado`);
    }
  }
}
