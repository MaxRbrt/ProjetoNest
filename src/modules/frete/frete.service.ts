import { Injectable } from '@nestjs/common';
import { EnderecosService } from '../enderecos/enderecos.service';
import { calcularOpcoesDeFrete, type OpcaoDeFrete } from './calculo-de-frete';
import { ConsultarFreteDto } from './dto/consultar-frete.dto';

@Injectable()
export class FreteService {
  constructor(private readonly enderecosService: EnderecosService) {}

  // ---------------------------------------------
  // Cotação de frete
  // buscarPorId já resolve ownership (404 se o endereço não for do usuário),
  // mesma regra usada em pedido — reaproveitada aqui, não reimplementada.
  // ---------------------------------------------
  async cotar(
    dto: ConsultarFreteDto,
    usuarioId: string,
  ): Promise<OpcaoDeFrete[]> {
    const endereco = await this.enderecosService.buscarPorId(
      dto.enderecoId,
      usuarioId,
    );
    const quantidadeDeItens = dto.itens.reduce(
      (soma, item) => soma + item.quantidade,
      0,
    );
    return calcularOpcoesDeFrete(endereco.uf, quantidadeDeItens);
  }
}
