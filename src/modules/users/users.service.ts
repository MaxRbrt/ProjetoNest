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

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ id });
  }

  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
  }

  toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      isEmailVerified: user.emailVerifiedAt !== null,
      createdAt: user.createdAt,
    };
  }
}
