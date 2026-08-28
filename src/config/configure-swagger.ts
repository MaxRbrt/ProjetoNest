import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// ---------------------------------------------
// Documentação interativa da API
// Publicada apenas fora de produção: a página expõe o desenho inteiro das
// rotas, incluindo as administrativas, e serve de mapa para quem sondar a
// API. O bearer auth declarado permite testar rota protegida direto na
// página, colando o access token devolvido pelo login.
// ---------------------------------------------
export function configureSwagger(app: INestApplication): void {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  const config = new DocumentBuilder()
    .setTitle('API do projeto de estudo')
    .setDescription(
      'API de catálogo e pedidos com autenticação JWT, papéis de acesso e ' +
        'pedidos restritos ao próprio usuário.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
}
