import { Reflector } from '@nestjs/core';
import { PAPEIS_KEY } from '../../decorators/papeis.decorator';
import { IS_PUBLICO_KEY } from '../../decorators/publico.decorator';
import { Papel } from '../usuarios/usuario.entity';
import { CategoriasController } from './categorias.controller';

// ---------------------------------------------
// Autorização das rotas de categorias
// Resolve a metadata como os guards globais: liberar a classe também libera
// a autenticação das escritas, enquanto retirar a exceção bloqueia a vitrine.
// ---------------------------------------------
describe('CategoriasController (autorização)', () => {
  const reflector = new Reflector();

  it.each(['listar', 'buscarPorId'] as const)(
    '%s permite leitura pública',
    (metodo) => {
      expect(
        reflector.getAllAndOverride<boolean>(IS_PUBLICO_KEY, [
          Reflect.get(CategoriasController.prototype, metodo) as () => unknown,
          CategoriasController,
        ]),
      ).toBe(true);
    },
  );

  it.each(['criar', 'update', 'remove'] as const)(
    '%s exige autenticação sem exceção no método ou na classe',
    (metodo) => {
      expect(
        reflector.get<boolean>(IS_PUBLICO_KEY, CategoriasController),
      ).toBeUndefined();
      expect(
        reflector.getAllAndOverride<boolean>(IS_PUBLICO_KEY, [
          Reflect.get(CategoriasController.prototype, metodo) as () => unknown,
          CategoriasController,
        ]),
      ).toBeUndefined();
    },
  );

  it.each(['criar', 'update', 'remove'] as const)(
    '%s permite somente ADMIN',
    (metodo) => {
      expect(
        reflector.getAllAndOverride<Papel[]>(PAPEIS_KEY, [
          Reflect.get(CategoriasController.prototype, metodo) as () => unknown,
          CategoriasController,
        ]),
      ).toEqual([Papel.ADMIN]);
    },
  );
});
