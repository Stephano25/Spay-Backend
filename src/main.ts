import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// ✅ Utiliser require pour les modules CommonJS
const session = require('express-session');
const passport = require('passport');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // ✅ Configuration des sessions
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'mon-super-secret-par-defaut',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000, // 24 heures
      },
    })
  );
  
  // ✅ Initialisation de Passport (MAINTENANT CORRECT)
  app.use(passport.initialize());
  app.use(passport.session());
  
  // Configuration des CORS
  const corsOrigin = process.env.CORS_ORIGIN 
    ? process.env.CORS_ORIGIN.split(',') 
    : ['http://localhost:4200', 'http://localhost:3000', 'http://localhost'];
    
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });
  
  app.setGlobalPrefix('api');
  
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`✅ Backend SPaye démarré sur http://localhost:${port}/api`);
  console.log(`📊 Environnement: ${process.env.NODE_ENV || 'development'}`);
}
bootstrap();