import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { UsuarioAtual } from '../../decorators/usuario-atual.decorator';
import type { UsuarioPublico } from '../usuarios/usuarios.service';
import { FreteService } from './frete.service';
import { ConsultarFreteDto } from './dto/consultar-frete.dto';
import type { OpcaoDeFrete } from './calculo-de-frete';

@ApiBearerAuth('access-token')
@Controller('shipping')
export class FreteController {
  constructor(private readonly freteService: FreteService) {}

  @Post('quote')
  cotar(
    @Body() dto: ConsultarFreteDto,
    @UsuarioAtual() usuario: UsuarioPublico,
  ): Promise<OpcaoDeFrete[]> {
    return this.freteService.cotar(dto, usuario.id);
  }
}
