import { Controller, Post, Body, UseGuards, Req, Get } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private walletService: WalletService) {}

  @Get()
  async getWallet(@Req() req) {
    return this.walletService.getWallet(req.user.userId);
  }

  @Get('balance')
  async getBalance(@Req() req) {
    return this.walletService.getBalance(req.user.userId);
  }

  @Post('generate-qr')
  async generateQRCode(@Req() req, @Body() body: { amount?: number }) {
    return this.walletService.generateReceiveQRCode(req.user.userId, body.amount);
  }

  @Post('scan-qr')
  async scanQRCode(@Req() req, @Body() body: { qrData: string }) {
    return this.walletService.scanQRCode(req.user.userId, body.qrData);
  }

  @Post('send-money')
  async sendMoney(@Req() req, @Body() body: { receiverId: string; amount: number; description?: string }) {
    return this.walletService.sendMoney(req.user.userId, body.receiverId, body.amount, body.description);
  }

  @Post('deposit')
  async deposit(@Req() req, @Body() body: { amount: number; paymentMethod?: string }) {
    return this.walletService.deposit(req.user.userId, body.amount, body.paymentMethod || 'bank_card');
  }

  @Post('withdraw')
  async withdraw(@Req() req, @Body() body: { amount: number; paymentMethod?: string }) {
    return this.walletService.withdraw(req.user.userId, body.amount, body.paymentMethod || 'bank_card');
  }

  @Post('sync')
  async syncWallet(@Req() req) {
    return this.walletService.syncWallet(req.user.userId);
  }
}