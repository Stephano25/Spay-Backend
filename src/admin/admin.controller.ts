import { Controller, Get, UseGuards, Patch, Param, Body, Delete, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { AdminService } from './admin.service';
// Corriger le chemin - enlever le dossier 'guards' supplémentaire
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard/stats')
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('users')
  async getAllUsers() {
    return this.adminService.getAllUsers();
  }

  @Get('users/:userId')
  async getUserById(@Param('userId') userId: string) {
    return this.adminService.getUserById(userId);
  }

  @Get('transactions')
  async getAllTransactions() {
    return this.adminService.getAllTransactions();
  }

  @Get('transactions/:transactionId')
  async getTransactionById(@Param('transactionId') transactionId: string) {
    return this.adminService.getTransactionById(transactionId);
  }

  @Patch('users/:userId/status')
  async updateUserStatus(
    @Param('userId') userId: string,
    @Body('isActive') isActive: boolean
  ) {
    return this.adminService.updateUserStatus(userId, isActive);
  }

  @Patch('users/:userId/role')
  async updateUserRole(
    @Param('userId') userId: string,
    @Body('role') role: string
  ) {
    return this.adminService.updateUserRole(userId, role);
  }

  @Delete('users/:userId')
  async deleteUser(@Param('userId') userId: string) {
    return this.adminService.deleteUser(userId);
  }

  @Get('settings')
  async getSettings() {
    return this.adminService.getSettings();
  }

  @Patch('settings')
  async updateSettings(@Body() settings: any) {
    return this.adminService.updateSettings(settings);
  }

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
}