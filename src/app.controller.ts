import { Controller, Get } from '@nestjs/common';
import { Publico } from './decorators/publico.decorator';

@Controller()
export class AppController {
  // ---------------------------------------------
  // Verificação de disponibilidade
  // Rota pública e sem dependência: responde enquanto o processo estiver de
  // pé e o event loop respondendo. Não consulta banco de propósito — um
  // health check que depende do banco confunde "aplicação morta" com
  // "banco lento", e é o balanceador de carga que lê esta resposta.
  // ---------------------------------------------
  @Publico()
  @Get()
  getStatus(): { status: string } {
    return { status: 'ok' };
  }
}
