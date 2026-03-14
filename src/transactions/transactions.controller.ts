import { Controller, Get, Post, Body, UseGuards, Req, Param } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { SendMoneyDto } from './dto/send-money.dto';

@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private transactionsService: TransactionsService) {}

  @Get('user/stats')
  async getUserStats(@Req() req) {
    const userId = req.user.userId;
    return this.transactionsService.getDashboardStats(userId);
  }

  @Get('user')
  async getUserTransactions(@Req() req) {
    const userId = req.user.userId;
    return this.transactionsService.getUserTransactions(userId);
  }

  @Post('send')
  async sendMoney(@Req() req, @Body() sendMoneyDto: SendMoneyDto) {
    const userId = req.user.userId;
    return this.transactionsService.sendMoney(userId, sendMoneyDto);
  }

  @Post('mobile-money')
  async mobileMoneyTransfer(@Req() req, @Body() data: { operator: string; phoneNumber: string; amount: number }) {
    const userId = req.user.userId;
    return this.transactionsService.mobileMoneyTransfer(userId, data.operator, data.phoneNumber, data.amount);
  }

  @Post('scan-pay')
  async scanAndPay(@Req() req, @Body() data: { receiverQrCode: string; amount: number; description?: string }) {
    const userId = req.user.userId;
    return this.transactionsService.scanAndPay(userId, data.receiverQrCode, data.amount);
  }
}