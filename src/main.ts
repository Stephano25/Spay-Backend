// backend/src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: ['http://localhost:4200'], credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  
  // ⚠️ IMPORTANT : Servir les fichiers statiques
  app.use('/uploads', express.static(join(__dirname, '..', 'uploads')));
  
  app.setGlobalPrefix('api');
  await app.listen(3000);
  console.log('✅ Backend running on http://localhost:3000/api');
}
bootstrap();