import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private transactionsService: TransactionsService) {}

  @Get('user/stats')
  async getUserStats(@Req() req) {
    console.log('🔐 Requête reçue de l\'utilisateur:', req.user);
    const userId = req.user.userId;
    return this.transactionsService.getDashboardStats(userId);
  }
}