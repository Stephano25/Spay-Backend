import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

@Controller()
export class AppController {
  @Get()
  getHello(): string {
    return 'SPaye API is running!';
  }
  
  @Get('health')
  healthCheck(@Res() res: Response) {
    return res.status(HttpStatus.OK).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      cors: 'enabled',
      uptime: process.uptime(),
    });
  }

  @Get('test-cors')
  testCors(@Res() res: Response) {
    return res.status(HttpStatus.OK).json({
      message: 'CORS est fonctionnel !',
      headers: {
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}