// backend/src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as os from 'os';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    exposedHeaders: ['Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });
  
  app.useGlobalPipes(new ValidationPipe({ 
    whitelist: true,
    transform: true,
  }));
  
  // 🔥 Servir les fichiers statiques uploadés
  app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads/' });
  app.setGlobalPrefix('api');
  
  const port = 3000;
  await app.listen(port, '0.0.0.0');
  
  console.log('===================================================');
  console.log('✅ Backend démarré avec succès !');
  console.log(`🌐 Accès local : http://localhost:${port}/api`);
  console.log('===================================================');
  console.log('📁 Fichiers statiques : /uploads/');
  console.log('===================================================');
}
bootstrap();