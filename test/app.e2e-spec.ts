import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { configureApp } from './../src/config/configure-app';

const mainDatabaseUrl = process.env.DATABASE_URL;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (testDatabaseUrl && testDatabaseUrl === mainDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL deve apontar para um banco isolado.');
}

const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET ??= 'test-only-secret-with-at-least-32-bytes';
    process.env.JWT_ISSUER ??= 'projeto-test-api';
    process.env.JWT_AUDIENCE ??= 'projeto-test-frontend';
    process.env.RESEND_API_KEY ??= 're_test_only';
    process.env.EMAIL_FROM ??= 'Testes <test@example.com>';
    process.env.FRONTEND_URL ??= 'http://localhost:3001';

    const { AppModule } = await import('./../src/app.module');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  afterAll(async () => {
    await app.close();
  });
});
