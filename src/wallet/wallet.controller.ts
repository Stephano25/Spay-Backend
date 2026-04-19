import { Controller, Get, Post, Body, UseGuards, Req, Param, Put } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('me')
  async getMyWallet(@Req() req) {
    const userId = req.user.userId;
    return this.walletService.getWalletStats(userId);
  }

  @Get('balance')
  async getBalance(@Req() req) {
    const userId = req.user.userId;
    return this.walletService.getBalance(userId);
  }

  @Post('transfer')
  async transferMoney(
    @Req() req,
    @Body() body: { receiverId: string; amount: number; description?: string }
  ) {
    const userId = req.user.userId;
    return this.walletService.transferMoney(userId, body.receiverId, body.amount, body.description);
  }

  @Post('deposit')
  async deposit(
    @Req() req,
    @Body() body: { amount: number; paymentMethod: string }
  ) {
    const userId = req.user.userId;
    return this.walletService.deposit(userId, body.amount, body.paymentMethod);
  }

  @Post('withdraw')
  async withdraw(
    @Req() req,
    @Body() body: { amount: number; paymentMethod: string }
  ) {
    const userId = req.user.userId;
    return this.walletService.withdraw(userId, body.amount, body.paymentMethod);
  }

  @Post('sync')
  async syncWallet(@Req() req) {
    const userId = req.user.userId;
    return this.walletService.syncWalletBalance(userId);
  }
}