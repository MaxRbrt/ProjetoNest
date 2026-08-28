import { SetMetadata } from '@nestjs/common';

// ---------------------------------------------
// Marcação de rota pública
// O guard de autenticação é global: tudo nasce protegido. Este decorator é a
// única forma de liberar uma rota, o que torna a exceção explícita e auditável.
// ---------------------------------------------
export const IS_PUBLIC_KEY = 'isPublic';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
