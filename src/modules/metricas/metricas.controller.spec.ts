import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PATH_METADATA } from '@nestjs/common/constants';
import { PAPEIS_KEY } from '../../decorators/papeis.decorator';
import { Papel } from '../usuarios/usuario.entity';
import { ConsultaDeMetricasDto } from './dto/consulta-de-metricas.dto';
import { MetricasController } from './metricas.controller';
import { MetricasService } from './metricas.service';

// ---------------------------------------------
// Controller de métricas
// A proteção vem dos guards globais; o que este arquivo precisa garantir é
// que a rota declara @Papeis(ADMIN) — sem isso o PapelGuard deixa qualquer
// usuário autenticado passar — e que o período só aceita a lista fechada.
// ---------------------------------------------
describe('MetricasController', () => {
  it('exige papel ADMIN na rota de leitura', () => {
    const rota = Object.getOwnPropertyDescriptor(
      MetricasController.prototype,
      'obter',
    )?.value as object;
    const papeis = Reflect.getMetadata(PAPEIS_KEY, rota) as Papel[] | undefined;

    expect(papeis).toEqual([Papel.ADMIN]);
  });

  it('responde em admin/metricas', () => {
    expect(Reflect.getMetadata(PATH_METADATA, MetricasController)).toBe(
      'admin/metricas',
    );
  });

  it('repassa o período validado ao serviço', async () => {
    const obter = jest.fn().mockResolvedValue({ periodo: '30d' });
    const controller = new MetricasController({
      obter,
    } as unknown as MetricasService);

    await controller.obter({ periodo: '30d' });

    expect(obter).toHaveBeenCalledWith('30d');
  });
});

describe('ConsultaDeMetricasDto', () => {
  async function errosPara(consulta: Record<string, unknown>) {
    return validate(plainToInstance(ConsultaDeMetricasDto, consulta));
  }

  it.each(['hoje', '7d', '30d', '90d'])('aceita %s', async (periodo) => {
    expect(await errosPara({ periodo })).toHaveLength(0);
  });

  it.each([{ periodo: '15d' }, { periodo: '' }, {}])(
    'rejeita %p',
    async (consulta) => {
      expect(await errosPara(consulta)).not.toHaveLength(0);
    },
  );
});
