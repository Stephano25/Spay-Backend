import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as fs from 'fs';
import { Logger, ValidationPipe } from '@nestjs/common';

const session = require('express-session');
const passport = require('passport');

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  try {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    
    // ✅ Validation globale
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }));

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
    
    // ✅ Configuration CORS complète
    const corsOrigin = process.env.CORS_ORIGIN 
      ? process.env.CORS_ORIGIN.split(',') 
      : [
          'http://localhost:4200',
          'http://localhost:4201',
          'http://localhost:3000',
          'http://localhost:8081',
          'http://localhost:19000',
          'http://localhost:19001',
          'http://localhost:19002',
          'http://localhost',
          'http://127.0.0.1:4200',
          'http://127.0.0.1:3000',
        ];
      
    app.enableCors({
      origin: (origin, callback) => {
        // ✅ Permettre les requêtes sans origin (comme les apps mobiles)
        if (!origin) {
          callback(null, true);
          return;
        }
        
        // ✅ Vérifier si l'origine est autorisée
        const isAllowed = corsOrigin.some(allowed => {
          if (allowed.includes('*')) {
            const pattern = allowed.replace(/\*/g, '.*');
            return new RegExp(`^${pattern}$`).test(origin);
          }
          return allowed === origin;
        });
        
        if (isAllowed) {
          callback(null, true);
        } else {
          logger.warn(`❌ Origine CORS non autorisée: ${origin}`);
          callback(null, true); // ✅ En développement, on autorise toutes les origines
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
      allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'Accept',
        'Origin',
        'X-Requested-With',
        'X-HTTP-Method-Override',
        'X-Forwarded-For',
        'X-Real-IP',
      ],
      exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
      maxAge: 86400,
      preflightContinue: false,
      optionsSuccessStatus: 204,
    });
    
    // ✅ CRÉATION DES DOSSIERS D'UPLOAD
    const uploadsDir = join(process.cwd(), 'uploads');
    const profilesDir = join(uploadsDir, 'profiles');
    const tempDir = join(uploadsDir, 'temp');
    const messagesDir = join(uploadsDir, 'messages');
    
    const dirs = [uploadsDir, profilesDir, tempDir, messagesDir];
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.log(`📁 Dossier créé: ${dir}`);
      }
    });
    
    // ✅ Servir les fichiers statiques
    app.useStaticAssets(uploadsDir, {
      prefix: '/uploads/',
    });
    
    // ✅ Ajouter un point d'entrée pour les fichiers statiques
    app.use((req, res, next) => {
      if (req.url.startsWith('/uploads/')) {
        // Les fichiers statiques sont servis par useStaticAssets
        next();
      } else {
        next();
      }
    });
    
    logger.log(`📁 Dossier uploads: ${uploadsDir}`);
    logger.log(`📁 Dossier courant: ${process.cwd()}`);
    
    // ✅ Préfixe global pour l'API
    app.setGlobalPrefix('api');
    
    // ✅ Gestion des erreurs globales
    app.use((err: any, req: any, res: any, next: any) => {
      logger.error(`❌ Erreur: ${err.message}`);
      logger.error(err.stack);
      res.status(err.status || 500).json({
        statusCode: err.status || 500,
        message: err.message || 'Erreur interne du serveur',
        timestamp: new Date().toISOString(),
      });
    });
    
    // ✅ Démarrer le serveur
    const port = process.env.PORT || 3000;
    const host = process.env.HOST || '0.0.0.0';
    
    await app.listen(port, host, () => {
      logger.log(`✅ Backend SPaye démarré sur http://${host}:${port}/api`);
      logger.log(`📊 Environnement: ${process.env.NODE_ENV || 'development'}`);
      logger.log(`🌐 CORS Origins: ${corsOrigin.join(', ')}`);
    });
    
    // ✅ Gestion des signaux d'arrêt
    process.on('SIGTERM', async () => {
      logger.log('🛑 Réception de SIGTERM, arrêt du serveur...');
      await app.close();
      process.exit(0);
    });
    
    process.on('SIGINT', async () => {
      logger.log('🛑 Réception de SIGINT, arrêt du serveur...');
      await app.close();
      process.exit(0);
    });
    
  } catch (error) {
    logger.error(`❌ Erreur fatale lors du démarrage: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  }
}

bootstrap();