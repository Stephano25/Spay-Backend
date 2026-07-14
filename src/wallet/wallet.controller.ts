// src/wallet/wallet.controller.ts
import { Controller, Post, Body, UseGuards, Req, Get } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private walletService: WalletService) {}

  @Get()
  async getWallet(@Req() req) {
    const userId = req.user.id || req.user.userId;
    return this.walletService.getWallet(userId);
  }

  @Get('balance')
  async getBalance(@Req() req) {
    const userId = req.user.id || req.user.userId;
    return this.walletService.getBalance(userId);
  }

  @Post('generate-qr')
  async generateQRCode(@Req() req, @Body() body: { amount?: number }) {
    const userId = req.user.id || req.user.userId;
    return this.walletService.generateReceiveQRCode(userId, body.amount);
  }

  @Post('scan-qr')
  async scanQRCode(@Req() req, @Body() body: { qrData: string }) {
    const userId = req.user.id || req.user.userId;
    return this.walletService.scanQRCode(userId, body.qrData);
  }

  @Post('send-money')
  async sendMoney(@Req() req, @Body() body: { receiverId: string; amount: number; description?: string }) {
    const userId = req.user.id || req.user.userId;
    return this.walletService.sendMoney(userId, body.receiverId, body.amount, body.description);
  }

  @Post('deposit')
  async deposit(@Req() req, @Body() body: { amount: number; paymentMethod?: string }) {
    const userId = req.user.id || req.user.userId;
    return this.walletService.deposit(userId, body.amount, body.paymentMethod || 'bank_card');
  }

  @Post('withdraw')
  async withdraw(@Req() req, @Body() body: { amount: number; paymentMethod?: string }) {
    const userId = req.user.id || req.user.userId;
    return this.walletService.withdraw(userId, body.amount, body.paymentMethod || 'bank_card');
  }

  @Post('sync')
  async syncWallet(@Req() req) {
    const userId = req.user.id || req.user.userId;
    return this.walletService.syncWallet(userId);
  }
}