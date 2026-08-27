import { SetMetadata } from '@nestjs/common';
import { Role } from '../modules/usuarios/entities/user.entity';

// ---------------------------------------------
// Exigência de papel na rota
// ---------------------------------------------
export const ROLES_KEY = 'roles';

export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
