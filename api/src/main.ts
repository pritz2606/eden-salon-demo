import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { config } from './config';
import { vercelOidcRequestContext } from './google-credential';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(vercelOidcRequestContext);
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(json({ limit: '16kb' }));
  app.use(cookieParser());
  app.use((_request: unknown, response: { setHeader: (key: string, value: string) => void }, next: () => void) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.enableCors({ origin: config.webOrigins, credentials: true, methods: ['GET', 'POST', 'OPTIONS'] });
  app.useGlobalPipes(new ValidationPipe({
    transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true,
    validationError: { target: false, value: false },
  }));
  app.enableShutdownHooks();
  await app.listen(config.port, config.host);
  console.info(`Eden Nest API listening on ${config.host}:${config.port}; ${config.demo ? 'local Firestore demo' : 'Cloud Firestore'}.`);
}

bootstrap().catch((error: unknown) => {
  console.error('Eden API could not start:', error instanceof Error ? error.message : 'Unknown startup error');
  process.exitCode = 1;
});
