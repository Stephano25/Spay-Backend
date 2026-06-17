// backend/src/app.controller.ts
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
  
  @Get('health')
  healthCheck() {
    return { 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      cors: 'enabled'
    };
  }

  @Get('test-cors')
  testCors() {
    return { 
      message: 'CORS est fonctionnel !',
      headers: {
        'Access-Control-Allow-Origin': '*'
      }
    };
  }
}