import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // CORS complet pour autoriser toutes les origines
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
  
  app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads/' });
  app.setGlobalPrefix('api');
  
  const port = 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`✅ Backend running on http://0.0.0.0:${port}/api`);
}
bootstrap();