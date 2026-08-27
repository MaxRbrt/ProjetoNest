import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

export interface PublicUser {
  id: string;
  email: string;
  isEmailVerified: boolean;
  createdAt: Date;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  // ---------------------------------------------
  // Busca de usuário por identificador
  // ---------------------------------------------
  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ id });
  }

  // ---------------------------------------------
  // Busca de credencial por email
  // ---------------------------------------------
  findByEmailWithPassword(email: string): Promise<User | null> {
    // passwordHash tem select: false na entidade e só entra em consultas que
    // precisam autenticar uma credencial explicitamente.
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
  }

  // ---------------------------------------------
  // Projeção pública do usuário
  // ---------------------------------------------
  toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      isEmailVerified: user.emailVerifiedAt !== null,
      createdAt: user.createdAt,
    };
  }
}
