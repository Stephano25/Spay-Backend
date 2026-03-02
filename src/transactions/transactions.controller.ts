import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { SendMoneyDto } from './dto/send-money.dto';

@Controller('transactions')
export class TransactionsController {
  constructor(private transactionsService: TransactionsService) {}

  @Get('stats')
  async getStats(@Req() req) {
    const userId = req.user?.userId;
    return this.transactionsService.getDashboardStats(userId);
  }

  @Post('send')
  async sendMoney(@Req() req, @Body() sendMoneyDto: SendMoneyDto) {
    const userId = req.user?.userId;
    return this.transactionsService.sendMoney(userId, sendMoneyDto);
  }

  @Post('mobile-money')
  async mobileMoneyTransfer(@Req() req, @Body() body: any) {
    const userId = req.user?.userId;
    return this.transactionsService.mobileMoneyTransfer(
      userId,
      body.operator,
      body.phoneNumber,
      body.amount
    );
  }

  @Post('scan-pay')
  async scanAndPay(@Req() req, @Body() body: any) {
    const userId = req.user?.userId;
    return this.transactionsService.scanAndPay(
      userId,
      body.receiverQrCode,
      body.amount
    );
  }
}