import { Controller, Post, Body, UseGuards, Req, Get } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private walletService: WalletService) {}

  /**
   * Récupère le wallet complet (avec statistiques)
   * Utilisé par WalletComponent, UserComponent, MobileMoneyComponent
   */
  @Get()
  async getWallet(@Req() req) {
    return this.walletService.getWallet(req.user.userId);
  }

  /**
   * Récupère uniquement le solde (appelé par ScanPayComponent)
   */
  @Get('balance')
  async getBalance(@Req() req) {
    return this.walletService.getBalance(req.user.userId);
  }

  /**
   * Génère un QR code pour recevoir de l'argent
   */
  @Post('generate-qr')
  async generateQRCode(@Req() req, @Body() body: { amount?: number }) {
    return this.walletService.generateReceiveQRCode(req.user.userId, body.amount);
  }

  /**
   * Scanne un QR code
   */
  @Post('scan-qr')
  async scanQRCode(@Req() req, @Body() body: { qrData: string }) {
    return this.walletService.scanQRCode(req.user.userId, body.qrData);
  }

  /**
   * Envoie de l'argent à un autre utilisateur
   */
  @Post('send-money')
  async sendMoney(@Req() req, @Body() body: { receiverId: string; amount: number; description?: string }) {
    return this.walletService.sendMoney(req.user.userId, body.receiverId, body.amount, body.description);
  }

  /**
   * Dépôt d'argent (simulation)
   */
  @Post('deposit')
  async deposit(@Req() req, @Body() body: { amount: number; paymentMethod?: string }) {
    return this.walletService.deposit(req.user.userId, body.amount, body.paymentMethod || 'bank_card');
  }

  /**
   * Retrait d'argent (simulation)
   */
  @Post('withdraw')
  async withdraw(@Req() req, @Body() body: { amount: number; paymentMethod?: string }) {
    return this.walletService.withdraw(req.user.userId, body.amount, body.paymentMethod || 'bank_card');
  }

  /**
   * Resynchronise le wallet avec le solde User.balance
   */
  @Post('sync')
  async syncWallet(@Req() req) {
    return this.walletService.syncWallet(req.user.userId);
  }
}