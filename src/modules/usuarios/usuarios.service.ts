import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Papel, Usuario } from './usuario.entity';

export interface UsuarioPublico {
  id: string;
  email: string;
  emailVerificado: boolean;
  criadoEm: Date;
  papel: Papel;
}

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario)
    private readonly repositorioDeUsuarios: Repository<Usuario>,
  ) {}

  // ---------------------------------------------
  // Busca de usuário por identificador
  // ---------------------------------------------
  buscarPorId(id: string): Promise<Usuario | null> {
    return this.repositorioDeUsuarios.findOneBy({ id });
  }

  // ---------------------------------------------
  // Busca de credencial por email
  // hashDaSenha tem select: false na entidade e só entra em consultas que
  // precisam autenticar uma credencial explicitamente.
  // ---------------------------------------------
  buscarPorEmailComSenha(email: string): Promise<Usuario | null> {
    return this.repositorioDeUsuarios
      .createQueryBuilder('usuario')
      .addSelect('usuario.hashDaSenha')
      .where('usuario.email = :email', { email })
      .getOne();
  }

  // ---------------------------------------------
  // Projeção pública do usuário
  // ---------------------------------------------
  paraUsuarioPublico(usuario: Usuario): UsuarioPublico {
    return {
      id: usuario.id,
      email: usuario.email,
      emailVerificado: usuario.emailVerificadoEm !== null,
      criadoEm: usuario.criadoEm,
      papel: usuario.papel,
    };
  }
}
