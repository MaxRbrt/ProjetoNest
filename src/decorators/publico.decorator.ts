import { SetMetadata } from '@nestjs/common';

// ---------------------------------------------
// Marcação de rota pública
// O guard de autenticação é global: tudo nasce protegido. Este decorator é a
// única forma de liberar uma rota, o que torna a exceção explícita e auditável.
// ---------------------------------------------
export const IS_PUBLICO_KEY = 'isPublic';

export const Publico = () => SetMetadata(IS_PUBLICO_KEY, true);
