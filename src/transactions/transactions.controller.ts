import { Controller, Get, Post, Body, UseGuards, Req, NotFoundException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private transactionsService: TransactionsService) {}

  @Get('user/stats')
  async getUserStats(@Req() req) {
    const userId = req.user.userId;
    const stats = await this.transactionsService.getDashboardStats(userId);
    if (!stats) {
      throw new NotFoundException('Statistiques non trouvées');
    }
    return stats;
  }

  @Get('user')
  async getUserTransactions(@Req() req) {
    const userId = req.user.userId;
    return this.transactionsService.getUserTransactions(userId);
  }
}