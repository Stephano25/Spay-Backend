import {
  Controller,
  Get,
  UseGuards,
  Patch,
  Param,
  Body,
  Delete,
  Post,
  HttpCode,
  HttpStatus,
  Req,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly adminService: AdminService) {}

  // ============================================================
  // DASHBOARD - Statistiques (selon le rôle)
  // ============================================================
  @Get('dashboard/stats')
  async getDashboardStats(@Req() req: any) {
    try {
      const userId = req.user.userId;
      const userRole = req.user.role;
      this.logger.log(`📊 Récupération des stats pour ${userRole} (${userId})`);
      const stats = await this.adminService.getDashboardStats(userId, userRole);
      return stats;
    } catch (error) {
      this.logger.error('❌ Erreur dashboard stats:', error);
      return {
        totalUsers: 0,
        activeUsers: 0,
        totalTransactions: 0,
        totalVolume: 0,
        recentUsers: [],
        recentTransactions: [],
        dailyStats: [],
        topUsers: [],
        totalAdmins: 0,
        totalSuperAdmins: 0,
      };
    }
  }

  // ============================================================
  // UTILISATEURS
  // ============================================================
  @Get('users')
  async getAllUsers() {
    return this.adminService.getAllUsers();
  }

  @Get('users/:userId')
  async getUserById(@Param('userId') userId: string) {
    return this.adminService.getUserById(userId);
  }

  @Patch('users/:userId/status')
  async updateUserStatus(
    @Param('userId') userId: string,
    @Body('isActive') isActive: boolean,
  ) {
    return this.adminService.updateUserStatus(userId, isActive);
  }

  @Patch('users/:userId/role')
  async updateUserRole(
    @Param('userId') userId: string,
    @Body('role') role: string,
  ) {
    return this.adminService.updateUserRole(userId, role);
  }

  @Delete('users/:userId')
  async deleteUser(@Param('userId') userId: string) {
    return this.adminService.deleteUser(userId);
  }

  // ============================================================
  // ADMIN ACTIONS - DÉPÔT (pour tous les admins)
  // ============================================================
  @Post('users/:userId/deposit')
  async depositMoney(
    @Param('userId') userId: string,
    @Body('amount') amount: number,
    @Body('description') description?: string,
    @Body('qrCode') qrCode?: string,
  ) {
    if (!userId) {
      throw new BadRequestException('ID utilisateur requis');
    }
    if (!amount || amount <= 0) {
      throw new BadRequestException('Montant invalide');
    }
    return this.adminService.depositMoney(userId, amount, description, qrCode);
  }

  // ============================================================
  // ADMIN ACTIONS - RETRAIT (pour tous les admins)
  // ============================================================
  @Post('users/:userId/withdraw')
  async withdrawMoney(
    @Param('userId') userId: string,
    @Body('amount') amount: number,
    @Body('description') description?: string,
    @Body('qrCode') qrCode?: string,
  ) {
    if (!userId) {
      throw new BadRequestException('ID utilisateur requis');
    }
    if (!amount || amount <= 0) {
      throw new BadRequestException('Montant invalide');
    }
    return this.adminService.withdrawMoney(userId, amount, description, qrCode);
  }

  // ============================================================
  // ADMIN ACTIONS - QR CODE POUR DÉPÔT/RETRAIT
  // ============================================================
  @Post('generate-qr')
  async generateQRCode(
    @Req() req: any,
    @Body('type') type: 'deposit' | 'withdraw',
    @Body('amount') amount?: number,
  ) {
    const adminId = req.user.userId;
    return this.adminService.generateQRCode(adminId, type, amount);
  }

  @Post('scan-qr')
  async scanQRCode(@Req() req: any, @Body('qrData') qrData: string) {
    const adminId = req.user.userId;
    return this.adminService.scanQRCode(adminId, qrData);
  }

  // ============================================================
  // ADMINISTRATEURS - CRUD (UNIQUEMENT SUPER_ADMIN)
  // ============================================================
  @Post('admins')
  @Roles('super_admin')
  async createAdmin(
    @Body()
    adminData: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      phoneNumber?: string;
      role?: 'admin' | 'super_admin';
    },
  ) {
    return this.adminService.createAdmin(adminData);
  }

  @Get('admins')
  @Roles('super_admin')
  async getAdmins() {
    return this.adminService.getAdmins();
  }

  @Delete('admins/:adminId')
  @Roles('super_admin')
  async deleteAdmin(@Param('adminId') adminId: string, @Req() req: any) {
    const currentAdminId = req.user.userId;
    return this.adminService.deleteAdmin(adminId, currentAdminId);
  }

  // ============================================================
  // TRANSACTIONS
  // ============================================================
  @Get('transactions')
  async getAllTransactions() {
    return this.adminService.getAllTransactions();
  }

  @Get('transactions/:transactionId')
  async getTransactionById(@Param('transactionId') transactionId: string) {
    return this.adminService.getTransactionById(transactionId);
  }

  // ============================================================
  // PARAMÈTRES SYSTÈME
  // ============================================================
  @Get('settings')
  async getSettings() {
    return this.adminService.getSettings();
  }

  @Patch('settings')
  async updateSettings(@Body() settings: any) {
    return this.adminService.updateSettings(settings);
  }

  // ============================================================
  // SYSTÈME
  // ============================================================
  @Get('system/logs')
  async getSystemLogs() {
    return this.adminService.getSystemLogs();
  }

  @Get('system/stats')
  async getSystemStats() {
    return this.adminService.getSystemStats();
  }

  @Post('system/clear-cache')
  @HttpCode(HttpStatus.OK)
  async clearCache() {
    return this.adminService.clearCache();
  }

  // ============================================================
  // PROFIL ADMIN
  // ============================================================
  @Get('profile')
  async getAdminProfile(@Req() req: any) {
    return this.adminService.getAdminProfile(req.user.userId);
  }

  @Patch('profile')
  async updateAdminProfile(@Req() req: any, @Body() updateData: any) {
    return this.adminService.updateAdminProfile(req.user.userId, updateData);
  }
}