import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configurarAplicacao } from './config/configurar-aplicacao';
import { configurarSwagger } from './config/configurar-swagger';

// ---------------------------------------------
// Inicialização da aplicação
// A porta sai do ConfigService, não de process.env: assim ela passa pela
// mesma validação de boot que o resto da configuração, em vez de virar NaN
// silenciosamente se alguém escrever PORT errado.
// ---------------------------------------------
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configurarAplicacao(app);
  configurarSwagger(app);
  await app.listen(app.get(ConfigService).getOrThrow<number>('PORT'));
}
void bootstrap();
