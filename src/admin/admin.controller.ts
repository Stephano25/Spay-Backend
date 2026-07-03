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
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ============================================================
  // DASHBOARD - Statistiques complètes
  // ============================================================
  @Get('dashboard/stats')
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
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
  // ADMIN ACTIONS - DÉPÔT (COMPLET)
  // ============================================================
  @Post('users/:userId/deposit')
  async depositMoney(
    @Param('userId') userId: string,
    @Body('amount') amount: number,
    @Body('description') description?: string,
  ) {
    if (!userId) {
      throw new BadRequestException('ID utilisateur requis');
    }
    if (!amount || amount <= 0) {
      throw new BadRequestException('Montant invalide');
    }
    return this.adminService.depositMoney(userId, amount, description);
  }

  // ============================================================
  // ADMIN ACTIONS - RETRAIT (COMPLET)
  // ============================================================
  @Post('users/:userId/withdraw')
  async withdrawMoney(
    @Param('userId') userId: string,
    @Body('amount') amount: number,
    @Body('description') description?: string,
  ) {
    if (!userId) {
      throw new BadRequestException('ID utilisateur requis');
    }
    if (!amount || amount <= 0) {
      throw new BadRequestException('Montant invalide');
    }
    return this.adminService.withdrawMoney(userId, amount, description);
  }

  // ============================================================
  // ADMINISTRATEURS - CRUD COMPLET
  // ============================================================
  @Post('admins')
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
  async getAdmins() {
    return this.adminService.getAdmins();
  }

  @Delete('admins/:adminId')
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
  // SYSTÈME - LOGS & STATS
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