import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

export const SENHA_TAMANHO_MINIMO = 8;
export const SENHA_TAMANHO_MAXIMO = 128;

const TEM_MAIUSCULA = /\p{Lu}/u;
const TEM_NUMERO = /\p{Nd}/u;
const TEM_ESPECIAL = /[^\p{L}\p{Nd}]/u;

// ---------------------------------------------
// Diagnóstico do que falta na senha
// Devolve todas as exigências não cumpridas de uma vez: recusar apontando um
// problema por tentativa faria o usuário descobrir a regra por adivinhação.
// O comprimento sai de Array.from, que conta pontos de código Unicode: com o
// length nativo, um caractere fora do BMP (um emoji, por exemplo) valeria por
// dois e a senha pareceria mais longa do que é.
// ---------------------------------------------
export function exigenciasNaoCumpridas(senha: string): string[] {
  const faltas: string[] = [];
  const comprimento = Array.from(senha).length;

  if (comprimento < SENHA_TAMANHO_MINIMO) {
    faltas.push(`ter pelo menos ${SENHA_TAMANHO_MINIMO} caracteres`);
  }
  if (comprimento > SENHA_TAMANHO_MAXIMO) {
    faltas.push(`ter no máximo ${SENHA_TAMANHO_MAXIMO} caracteres`);
  }
  if (!TEM_MAIUSCULA.test(senha)) {
    faltas.push('conter uma letra maiúscula');
  }
  if (!TEM_NUMERO.test(senha)) {
    faltas.push('conter um número');
  }
  if (!TEM_ESPECIAL.test(senha)) {
    faltas.push('conter um caractere especial');
  }

  return faltas;
}

// ---------------------------------------------
// Regra de senha compartilhada
// Cadastro e redefinição precisam exigir exatamente o mesmo: se divergirem, o
// usuário troca por uma senha que não passaria no cadastro e a regra vira
// decorativa. É um validador próprio, e não vários @Matches, porque
// decoradores repetidos na mesma propriedade colidem na mesma chave de
// restrição — só a última mensagem sobreviveria, e o usuário não saberia o
// que corrigir.
//
// O comprimento mínimo é modesto por decisão do proprietário. Quem sustenta a
// segurança aqui é a checagem contra a base de vazamentos (HIBP) feita no
// serviço de senha: ela barra combinações que cumprem a composição mas são
// previsíveis, como as variações de "Senha@123".
// ---------------------------------------------
export function SenhaValida(opcoes?: ValidationOptions) {
  return function (objeto: object, propriedade: string): void {
    registerDecorator({
      name: 'senhaValida',
      target: objeto.constructor,
      propertyName: propriedade,
      options: opcoes,
      validator: {
        validate(valor: unknown): boolean {
          return (
            typeof valor === 'string' &&
            exigenciasNaoCumpridas(valor).length === 0
          );
        },
        defaultMessage(argumentos: ValidationArguments): string {
          if (typeof argumentos.value !== 'string') {
            return 'A senha é obrigatória.';
          }
          const faltas = exigenciasNaoCumpridas(argumentos.value);
          return `A senha precisa ${faltas.join(', ')}.`;
        },
      },
    });
  };
}
