import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // CORS - Permettre les deux origines
  app.enableCors({
    origin: ['http://localhost:4200', 'http://localhost:3000', 'http://127.0.0.1:4200'],
    credentials: true,
  });
  
  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  
  // Serve uploaded files
  app.use('/uploads', express.static(join(__dirname, '..', 'uploads')));
  
  // Global prefix
  app.setGlobalPrefix('api');
  
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`✅ Backend running on: http://localhost:${port}/api`);
  console.log(`📡 WebSocket on: ws://localhost:${port}`);
}
bootstrap();