// src/health.controller.ts
import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';

@Controller('health')
export class HealthController {
  @Get()
  healthCheck(@Res() res: Response) {
    return res.status(HttpStatus.OK).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      cors: 'enabled',
      uptime: process.uptime(),
    });
  }
}