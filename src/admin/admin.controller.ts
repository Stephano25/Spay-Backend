import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@Controller('admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ============================================================
  // ✅ HELPER : extraction robuste de l'ID utilisateur depuis le JWT
  // ============================================================
  private extractUserId(req: any): string {
    const userId =
      req.user?.id ||
      req.user?._id?.toString?.() ||
      req.user?.sub ||
      req.user?.userId ||
      null;

    if (!userId) {
      console.warn('⚠️ Impossible d\'extraire userId depuis req.user:', req.user);
    }

    return userId;
  }

  // ============================================================
  // TABLEAU DE BORD ADMIN
  // ============================================================

  @Get('dashboard/stats')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getDashboardStats(@Request() req) {
    const userId = this.extractUserId(req);
    const userRole = req.user?.role;
    return this.adminService.getDashboardStats(userId, userRole);
  }

  @Get('dashboard/commissions')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getCommissionStats(@Request() req) {
    const userId = this.extractUserId(req);
    const userRole = req.user?.role;
    return this.adminService.getCommissionStats(userId, userRole);
  }

  @Get('dashboard/recent-transactions')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getRecentTransactions(@Query('limit') limit: number = 10) {
    return this.adminService.getRecentTransactions(limit);
  }

  @Get('dashboard/recent-users')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getRecentUsers(@Query('limit') limit: number = 10) {
    return this.adminService.getRecentUsers(limit);
  }

  // ============================================================
  // QR CODE
  // ============================================================

  @Post('generate-qr')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async generateQRCode(
    @Request() req,
    @Body('type') type: 'deposit' | 'withdraw',
    @Body('amount') amount?: number,
  ) {
    const adminId = this.extractUserId(req);
    return this.adminService.generateQRCode(adminId, type, amount);
  }

  @Post('scan-qr')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async scanQRCode(
    @Request() req,
    @Body('qrData') qrData: string,
  ) {
    const adminId = this.extractUserId(req);
    return this.adminService.scanQRCode(adminId, qrData);
  }

  // ============================================================
  // GESTION DES UTILISATEURS
  // ============================================================

  @Get('users')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getAllUsers(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('search') search?: string,
  ) {
    return this.adminService.getAllUsers(page, limit, search);
  }

  @Get('users/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getUserById(@Param('id') id: string) {
    return this.adminService.getUserById(id);
  }

  @Put('users/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updateUser(@Param('id') id: string, @Body() updateData: any) {
    return this.adminService.updateUser(id, updateData);
  }

  @Delete('users/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  @Post('users/:id/activate')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async activateUser(@Param('id') id: string) {
    return this.adminService.activateUser(id);
  }

  @Post('users/:id/deactivate')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async deactivateUser(@Param('id') id: string) {
    return this.adminService.deactivateUser(id);
  }

  @Post('users/:id/role')
  @Roles(UserRole.SUPER_ADMIN)
  async updateUserRole(@Param('id') id: string, @Body('role') role: UserRole) {
    return this.adminService.updateUserRole(id, role);
  }

  @Post('users/:id/balance')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updateUserBalance(
    @Param('id') id: string,
    @Body('amount') amount: number,
    @Body('operation') operation: 'add' | 'subtract' | 'set',
  ) {
    return this.adminService.updateUserBalance(id, amount, operation);
  }

  // ============================================================
  // GESTION DES TRANSACTIONS
  // ============================================================

  @Get('transactions')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getAllTransactions(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('userId') userId?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.getAllTransactions(page, limit, userId, type, status);
  }

  @Get('transactions/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getTransactionById(@Param('id') id: string) {
    return this.adminService.getTransactionById(id);
  }

  @Post('transactions/:id/status')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updateTransactionStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Body('reason') reason?: string,
  ) {
    return this.adminService.updateTransactionStatus(id, status, reason);
  }

  // ============================================================
  // GESTION DES VERSEMENTS
  // ============================================================

  @Post('users/:userId/deposit')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async depositMoney(
    @Param('userId') userId: string,
    @Body('amount') amount: number,
    @Body('description') description: string,
    @Request() req,
    @Body('qrCode') qrCode?: string,
  ) {
    const adminId = this.extractUserId(req);
    return this.adminService.depositMoney(adminId, userId, amount, description, qrCode);
  }

  @Post('users/:userId/withdraw')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async withdrawMoney(
    @Param('userId') userId: string,
    @Body('amount') amount: number,
    @Body('description') description: string,
    @Request() req,
    @Body('qrCode') qrCode?: string,
  ) {
    const adminId = this.extractUserId(req);
    return this.adminService.withdrawMoney(adminId, userId, amount, description, qrCode);
  }

  // ============================================================
  // STATISTIQUES AVANCÉES
  // ============================================================

  @Get('stats/revenue')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getRevenueStats(
    @Query('period') period: 'day' | 'week' | 'month' | 'year' = 'month',
  ) {
    return this.adminService.getRevenueStats(period);
  }

  @Get('stats/users-growth')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getUserGrowthStats(
    @Query('period') period: 'day' | 'week' | 'month' | 'year' = 'month',
  ) {
    return this.adminService.getUserGrowthStats(period);
  }

  @Get('stats/transactions-volume')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getTransactionVolumeStats(
    @Query('period') period: 'day' | 'week' | 'month' | 'year' = 'month',
  ) {
    return this.adminService.getTransactionVolumeStats(period);
  }

  // ============================================================
  // GESTION DES ADMINISTRATEURS (SUPER ADMIN UNIQUEMENT)
  // ============================================================

  @Get('admins')
  @Roles(UserRole.SUPER_ADMIN)
  async getAdmins() {
    return this.adminService.getAdmins();
  }

  @Post('admins')
  @Roles(UserRole.SUPER_ADMIN)
  async createAdmin(
    @Body('email') email: string,
    @Body('password') password: string,
    @Body('firstName') firstName: string,
    @Body('lastName') lastName: string,
    @Body('role') role: UserRole,
  ) {
    if (role !== UserRole.ADMIN && role !== UserRole.SUPER_ADMIN) {
      throw new BadRequestException('Rôle invalide pour un administrateur');
    }
    return this.adminService.createAdmin({ email, password, firstName, lastName, role });
  }

  @Delete('admins/:id')
  @Roles(UserRole.SUPER_ADMIN)
  async removeAdmin(@Param('id') id: string, @Request() req) {
    const currentUserId = this.extractUserId(req);
    if (id === currentUserId) {
      throw new BadRequestException('Vous ne pouvez pas vous supprimer vous-même');
    }
    return this.adminService.deleteAdmin(id, currentUserId);
  }

  // ============================================================
  // PARAMÈTRES SYSTÈME
  // ============================================================

  @Get('settings')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getSettings(@Request() req) {
    const user = req.user;
    return this.adminService.getSettings(user);
  }

  @Patch('settings')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updateSettings(@Request() req, @Body() settings: any) {
    const user = req.user;
    return this.adminService.updateSettings(settings, user);
  }

  @Get('system/stats')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getSystemStats() {
    return this.adminService.getSystemStats();
  }

  @Get('system/logs')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getSystemLogs(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.adminService.getSystemLogs(page, limit, type, from, to);
  }

  @Delete('system/logs')
  @Roles(UserRole.SUPER_ADMIN)
  async clearLogs(@Query('olderThan') olderThan?: string) {
    return this.adminService.clearLogs(olderThan);
  }
}