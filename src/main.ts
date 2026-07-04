// backend/src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // ✅ CORS correctement configuré
  app.enableCors({
    origin: ['http://localhost:4200', 'http://localhost:3000', 'http://localhost'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    exposedHeaders: ['Authorization'],
  });
  
  app.useGlobalPipes(new ValidationPipe({ 
    whitelist: true,
    transform: true,
  }));
  
  // ✅ Servir les fichiers statiques
  app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads/' });
  
  // ✅ Forcer le type de réponse JSON pour toutes les routes API
  app.use((req, res, next) => {
    res.setHeader('Content-Type', 'application/json');
    next();
  });
  
  app.setGlobalPrefix('api');
  
  const port = 3000;
  await app.listen(port, '0.0.0.0');
  
  console.log('===================================================');
  console.log('✅ Backend démarré avec succès !');
  console.log(`🌐 Accès local : http://localhost:${port}/api`);
  console.log('===================================================');
}
bootstrap();