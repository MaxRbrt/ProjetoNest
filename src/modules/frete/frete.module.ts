import { Module } from '@nestjs/common';
import { EnderecosModule } from '../enderecos/enderecos.module';
import { FreteController } from './frete.controller';
import { FreteService } from './frete.service';

// ---------------------------------------------
// Composição do módulo de frete
// Importa EnderecosModule (não a entidade direto) porque precisa da regra de
// ownership de EnderecosService.buscarPorId, não só do repositório.
// ---------------------------------------------
@Module({
  imports: [EnderecosModule],
  controllers: [FreteController],
  providers: [FreteService],
  exports: [FreteService],
})
export class FreteModule {}
