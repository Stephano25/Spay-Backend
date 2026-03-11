import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('me')
  async getMyWallet(@Req() req) {
    const userId = req.user.userId;
    return this.walletService.getWalletByUserId(userId);
  }

  @Get('stats')
  async getWalletStats(@Req() req) {
    const userId = req.user.userId;
    return this.walletService.getWalletStats(userId);
  }

  @Get('balance')
  async getBalance(@Req() req) {
    const userId = req.user.userId;
    return this.walletService.getBalance(userId);
  }

  @Post('send')
  async sendMoney(@Req() req, @Body() sendMoneyDto: any) {
    const userId = req.user.userId;
    return this.walletService.sendMoney(userId, sendMoneyDto);
  }

  @Post('deposit')
  async deposit(@Req() req, @Body() depositDto: any) {
    const userId = req.user.userId;
    return this.walletService.deposit(userId, depositDto);
  }

  @Post('withdraw')
  async withdraw(@Req() req, @Body() withdrawDto: any) {
    const userId = req.user.userId;
    return this.walletService.withdraw(userId, withdrawDto);
  }

  @Post('generate-qr')
  async generateQRCode(@Req() req, @Body() body: { amount?: number }) {
    const userId = req.user.userId;
    return this.walletService.generateQRCode(userId, body.amount);
  }
}