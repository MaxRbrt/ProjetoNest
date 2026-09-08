import { SetMetadata } from '@nestjs/common';
import { Papel } from '../modules/usuarios/usuario.entity';

// ---------------------------------------------
// Exigência de papel na rota
// ---------------------------------------------
export const PAPEIS_KEY = 'roles';

export const Papeis = (...roles: Papel[]) => SetMetadata(PAPEIS_KEY, roles);
