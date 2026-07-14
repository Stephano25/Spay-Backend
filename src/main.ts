// backend/src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as fs from 'fs';

const session = require('express-session');
const passport = require('passport');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // Configuration des sessions
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'mon-super-secret-par-defaut',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000,
      },
    })
  );
  
  app.use(passport.initialize());
  app.use(passport.session());
  
  // Configuration CORS
  const corsOrigin = process.env.CORS_ORIGIN 
    ? process.env.CORS_ORIGIN.split(',') 
    : [
        'http://localhost:4200',
        'http://localhost:3000',
        'http://localhost:8081',
        'http://localhost:19000',
        'http://localhost:19001',
        'http://localhost:19002',
        'http://localhost',
      ];
    
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type', 
      'Authorization', 
      'Accept',
      'Origin',
      'X-Requested-With',
    ],
    exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
    maxAge: 86400,
  });
  
  // ✅ SERVIR LES FICHIERS STATIQUES - CORRECTION
  const uploadsDir = join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log(`📁 Dossier uploads créé: ${uploadsDir}`);
  }
  
  // ✅ Servir les fichiers du dossier uploads avec le bon préfixe
  app.useStaticAssets(uploadsDir, {
    prefix: '/uploads/',
  });
  
  console.log(`📁 Dossier uploads: ${uploadsDir}`);
  console.log(`📁 Dossier courant: ${process.cwd()}`);
  
  app.setGlobalPrefix('api');
  
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`✅ Backend SPaye démarré sur http://0.0.0.0:${port}/api`);
  console.log(`📊 Environnement: ${process.env.NODE_ENV || 'development'}`);
}
bootstrap();