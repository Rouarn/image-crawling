import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { STORAGE_ROOT, ensureDir } from './common/constants';
import * as express from 'express';

async function bootstrap() {
  // Ensure storage directory exists before static serving starts
  ensureDir(STORAGE_ROOT);

  const app = await NestFactory.create(AppModule);

  // Enable CORS for frontend
  app.enableCors();

  // Increase body limit
  app.use(express.json({ limit: '200kb' }));

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const PORT = process.env.PORT || 3000;
  await app.listen(PORT);
  console.log(`Backend server is running on: http://localhost:${PORT}`);
}
void bootstrap();
