import { Controller, Post, Body, UseGuards, Req, Get } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private walletService: WalletService) {}

  @Get()
  async getWallet(@Req() req) {
    const userId = req.user.userId;
    return this.walletService.getWallet(userId);
  }

  @Post('generate-qr')
  async generateQRCode(@Req() req, @Body() body: { amount?: number }) {
    const userId = req.user.userId;
    return this.walletService.generateReceiveQRCode(userId, body.amount);
  }

  @Post('scan-qr')
  async scanQRCode(@Req() req, @Body() body: { qrData: string }) {
    const userId = req.user.userId;
    return this.walletService.scanQRCode(userId, body.qrData);
  }

  @Post('send-money')
  async sendMoney(@Req() req, @Body() body: { receiverId: string; amount: number }) {
    const userId = req.user.userId;
    return this.walletService.sendMoney(userId, body.receiverId, body.amount);
  }
}