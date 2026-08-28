import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

// ---------------------------------------------
// Configuração global da camada HTTP
// ---------------------------------------------
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const frontendOrigin = new URL(config.getOrThrow<string>('FRONTEND_URL'))
    .origin;

  // ---------------------------------------------
  // Cabeçalhos de segurança e leitura de cookies
  // ---------------------------------------------
  app.use(helmet());
  app.use(cookieParser());

  // ---------------------------------------------
  // Validação e transformação dos payloads
  // ---------------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ---------------------------------------------
  // Acesso autorizado da aplicação cliente
  // ---------------------------------------------
  app.enableCors({
    origin: [frontendOrigin],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  });
}
