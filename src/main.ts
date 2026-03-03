import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.enableCors({
    origin: 'http://localhost:4200',
    credentials: true,
  });
  
  app.useGlobalPipes(new ValidationPipe());
  
  // Servir les fichiers uploadés
  app.use('/uploads', express.static(join(__dirname, '..', 'uploads')));
  
  await app.listen(3000);
  console.log('Backend is running on: http://localhost:3000');
}
bootstrap();