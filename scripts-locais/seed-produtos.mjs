// ---------------------------------------------
// Popular o catálogo de demonstração
// Roda contra a API local (http://localhost:3000), autenticando como ADMIN
// via /auth/login. Idempotente: categorias e produtos já existentes (mesmo
// nome) não são duplicados, então rodar de novo só completa o que faltar.
// Não usa SQL — só os endpoints públicos da API, mesma regra do restante
// do projeto.
//
// Uso (no terminal, nunca cole a senha no chat):
//   cd projeto-test
//   ADMIN_EMAIL="seu@email.com" ADMIN_PASSWORD="sua-senha" node scripts-locais/seed-produtos.mjs
// ---------------------------------------------

const API = process.env.API_URL ?? 'http://localhost:3000';
const ORIGEM = process.env.FRONTEND_URL ?? 'http://localhost:3001';
const EMAIL = process.env.ADMIN_EMAIL;
const SENHA = process.env.ADMIN_PASSWORD;

if (!EMAIL || !SENHA) {
  console.error(
    'Defina ADMIN_EMAIL e ADMIN_PASSWORD como variáveis de ambiente antes de rodar.\n' +
      'Exemplo: ADMIN_EMAIL="voce@exemplo.com" ADMIN_PASSWORD="sua-senha" node scripts-locais/seed-produtos.mjs',
  );
  process.exit(1);
}

const CATEGORIAS = [
  {
    nome: 'Eletrônicos',
    produtos: [
      { nome: 'Fone de Ouvido Bluetooth', precoEmCentavos: 12990, estoque: 18 },
      { nome: 'Caixa de Som Portátil', precoEmCentavos: 18990, estoque: 9 },
      { nome: 'Smartwatch Esportivo', precoEmCentavos: 34990, estoque: 2 },
      { nome: 'Carregador Portátil 10000mAh', precoEmCentavos: 8990, estoque: 0 },
    ],
  },
  {
    nome: 'Informática',
    produtos: [
      { nome: 'Mouse sem Fio Ergonômico', precoEmCentavos: 7990, estoque: 25 },
      { nome: 'Teclado Mecânico Compacto', precoEmCentavos: 24900, estoque: 6 },
      { nome: 'Webcam Full HD', precoEmCentavos: 15990, estoque: 3 },
      { nome: 'Hub USB-C 6 em 1', precoEmCentavos: 11990, estoque: 14 },
    ],
  },
  {
    nome: 'Casa e Cozinha',
    produtos: [
      { nome: 'Cafeteira Elétrica 30 Xícaras', precoEmCentavos: 15990, estoque: 7 },
      { nome: 'Liquidificador Compacto', precoEmCentavos: 12990, estoque: 11 },
      { nome: 'Jogo de Panelas Antiaderente', precoEmCentavos: 29990, estoque: 0 },
      { nome: 'Air Fryer 4 Litros', precoEmCentavos: 39990, estoque: 5 },
    ],
  },
  {
    nome: 'Livros',
    produtos: [
      { nome: 'Dom Casmurro', precoEmCentavos: 3990, estoque: 40 },
      { nome: 'O Alquimista', precoEmCentavos: 4490, estoque: 22 },
      { nome: 'Sapiens: Uma Breve História da Humanidade', precoEmCentavos: 5990, estoque: 1 },
      { nome: 'A Revolução dos Bichos', precoEmCentavos: 3490, estoque: 17 },
    ],
  },
  {
    nome: 'Esporte e Lazer',
    produtos: [
      { nome: 'Tapete de Yoga', precoEmCentavos: 8990, estoque: 13 },
      { nome: 'Garrafa Térmica 1 Litro', precoEmCentavos: 6990, estoque: 30 },
      { nome: 'Corda de Pular Profissional', precoEmCentavos: 4990, estoque: 2 },
      { nome: 'Kit Halteres Ajustáveis', precoEmCentavos: 45990, estoque: 4 },
    ],
  },
];

async function req(caminho, opcoes = {}) {
  const resposta = await fetch(`${API}${caminho}`, {
    ...opcoes,
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGEM,
      ...(opcoes.headers ?? {}),
    },
  });
  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`${opcoes.method ?? 'GET'} ${caminho} -> ${resposta.status}: ${corpo}`);
  }
  return resposta.status === 204 ? null : resposta.json();
}

async function main() {
  console.log('Entrando como', EMAIL, '…');
  const sessao = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, senha: SENHA }),
  });
  const auth = { Authorization: `Bearer ${sessao.tokenDeAcesso}` };

  const categoriasExistentes = await req('/categories?limite=100');
  const porNome = new Map(
    categoriasExistentes.dados.map((c) => [c.nome.toLowerCase(), c]),
  );

  const produtosExistentes = await req('/products?limite=100');
  const nomesDeProdutos = new Set(
    produtosExistentes.dados.map((p) => p.nome.toLowerCase()),
  );

  let categoriasCriadas = 0;
  let produtosCriados = 0;
  let produtosIgnorados = 0;

  for (const grupo of CATEGORIAS) {
    let categoria = porNome.get(grupo.nome.toLowerCase());
    if (!categoria) {
      categoria = await req('/categories', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ nome: grupo.nome }),
      });
      porNome.set(grupo.nome.toLowerCase(), categoria);
      categoriasCriadas++;
      console.log('Categoria criada:', grupo.nome);
    } else {
      console.log('Categoria já existia:', grupo.nome);
    }

    for (const produto of grupo.produtos) {
      if (nomesDeProdutos.has(produto.nome.toLowerCase())) {
        produtosIgnorados++;
        console.log('  Produto já existia, pulando:', produto.nome);
        continue;
      }
      await req('/products', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ ...produto, categoriaId: categoria.id }),
      });
      nomesDeProdutos.add(produto.nome.toLowerCase());
      produtosCriados++;
      console.log('  Produto criado:', produto.nome);
    }
  }

  console.log('\nResumo:');
  console.log(`  Categorias criadas: ${categoriasCriadas}`);
  console.log(`  Produtos criados: ${produtosCriados}`);
  console.log(`  Produtos já existentes (ignorados): ${produtosIgnorados}`);
}

main().catch((erro) => {
  console.error('\nFalhou:', erro.message);
  process.exit(1);
});
