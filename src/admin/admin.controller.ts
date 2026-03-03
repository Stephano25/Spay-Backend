import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { AdminDashboardStats } from './admin.types'; // IMPORTER LE TYPE

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('dashboard/stats')
  async getDashboardStats(): Promise<AdminDashboardStats> {
    try {
      console.log('📡 Requête reçue pour /admin/dashboard/stats');
      const stats = await this.adminService.getDashboardStats();
      console.log('✅ Données envoyées:', stats);
      return stats;
    } catch (error) {
      console.error('❌ Erreur:', error);
      throw error;
    }
  }

  @Get('users')
  async getAllUsers() {
    return this.adminService.getAllUsers();
  }

  @Get('transactions')
  async getAllTransactions() {
    return this.adminService.getAllTransactions();
  }
}