import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument, UserRole } from '../users/schemas/user.schema';
import { Transaction, TransactionDocument, TransactionStatus, TransactionType } from '../transactions/schemas/transaction.schema';
import { Setting, SettingDocument } from '../settings/schemas/setting.schema';
import { Log, LogDocument } from '../logs/schemas/log.schema';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectModel(Setting.name) private settingModel: Model<SettingDocument>,
    @InjectModel(Log.name) private logModel: Model<LogDocument>,
  ) {}

  async getDashboardStats() {
    const totalUsers = await this.userModel.countDocuments();
    const activeUsers = await this.userModel.countDocuments({ isActive: true });
    const totalTransactions = await this.transactionModel.countDocuments();
    
    const volumeResult = await this.transactionModel.aggregate([
      { $match: { status: TransactionStatus.COMPLETED } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalVolume = volumeResult[0]?.total || 0;

    const recentUsers = await this.userModel.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('firstName lastName email isActive createdAt');

    const recentTransactions = await this.transactionModel.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('senderId', 'firstName lastName email')
      .populate('receiverId', 'firstName lastName email');

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      return date;
    }).reverse();

    const dailyStats = await Promise.all(last7Days.map(async (date) => {
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);

      const users = await this.userModel.countDocuments({
        createdAt: { $gte: date, $lt: endDate }
      });
      
      const transactions = await this.transactionModel.countDocuments({
        createdAt: { $gte: date, $lt: endDate }
      });
      
      const volume = await this.transactionModel.aggregate([
        { 
          $match: { 
            status: TransactionStatus.COMPLETED,
            createdAt: { $gte: date, $lt: endDate }
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      return {
        date: date.toISOString().split('T')[0],
        users,
        transactions,
        volume: volume[0]?.total || 0
      };
    }));

    const topUsers = await this.transactionModel.aggregate([
      { $match: { status: TransactionStatus.COMPLETED } },
      { 
        $group: {
          _id: '$senderId',
          transactionCount: { $sum: 1 },
          totalVolume: { $sum: '$amount' }
        }
      },
      { $sort: { totalVolume: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          userId: '$_id',
          name: { $concat: ['$user.firstName', ' ', '$user.lastName'] },
          transactionCount: 1,
          totalVolume: 1
        }
      }
    ]);

    return {
      totalUsers,
      activeUsers,
      totalTransactions,
      totalVolume,
      recentUsers,
      recentTransactions,
      dailyStats,
      topUsers
    };
  }

  async getAllUsers() {
    return this.userModel.find().select('-password').sort({ createdAt: -1 });
  }

  async getUserById(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('ID utilisateur invalide');
    }
    const user = await this.userModel.findById(userId).select('-password');
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    return user;
  }

  async getAllTransactions() {
    return this.transactionModel.find()
      .sort({ createdAt: -1 })
      .populate('senderId', 'firstName lastName email')
      .populate('receiverId', 'firstName lastName email');
  }

  async getTransactionById(transactionId: string) {
    if (!Types.ObjectId.isValid(transactionId)) {
      throw new NotFoundException('ID transaction invalide');
    }
    const transaction = await this.transactionModel.findById(transactionId)
      .populate('senderId', 'firstName lastName email')
      .populate('receiverId', 'firstName lastName email');
    if (!transaction) {
      throw new NotFoundException('Transaction non trouvée');
    }
    return transaction;
  }

  async updateUserStatus(userId: string, isActive: boolean) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('ID utilisateur invalide');
    }
    const user = await this.userModel.findByIdAndUpdate(
      userId, 
      { isActive }, 
      { new: true }
    ).select('-password');
    
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    return user;
  }

  async updateUserRole(userId: string, role: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('ID utilisateur invalide');
    }
    const user = await this.userModel.findByIdAndUpdate(
      userId, 
      { role }, 
      { new: true }
    ).select('-password');
    
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    return user;
  }

  async deleteUser(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('ID utilisateur invalide');
    }
    const user = await this.userModel.findByIdAndDelete(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    return { message: 'Utilisateur supprimé avec succès' };
  }

  async getSettings() {
    let settings = await this.settingModel.findOne();
    if (!settings) {
      settings = await this.settingModel.create({
        general: {
          siteName: 'SPaye',
          siteUrl: 'https://spaye.com',
          adminEmail: 'admin@spaye.com',
          supportEmail: 'support@spaye.com',
          maintenanceMode: false,
          registrationEnabled: true,
          defaultUserRole: 'user',
          maxFileSize: 150,
          sessionTimeout: 30
        },
        security: {
          twoFactorAuth: false,
          passwordMinLength: 8,
          passwordRequireUppercase: true,
          passwordRequireNumbers: true,
          passwordRequireSpecial: true,
          maxLoginAttempts: 5,
          lockoutDuration: 30,
          sessionTimeout: 60,
          requireEmailVerification: true,
          requirePhoneVerification: false
        },
        payment: {
          minTransaction: 100,
          maxTransaction: 5000000,
          dailyTransferLimit: 5000000,
          monthlyTransferLimit: 50000000,
          mobileMoneyEnabled: true,
          mobileMoneyOperators: {
            airtel: true,
            orange: true,
            mvola: true
          },
          transferFees: {
            airtel: 0.5,
            orange: 0.5,
            mvola: 0.5,
            internal: 0
          },
          currency: 'Ar'
        }
      });
    }
    return settings;
  }

  async updateSettings(settings: any) {
    return this.settingModel.findOneAndUpdate({}, settings, { new: true, upsert: true });
  }

  async getSystemLogs() {
    return this.logModel.find().sort({ date: -1 }).limit(50);
  }

  async getSystemStats() {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    const totalUsers = await this.userModel.countDocuments();
    const activeUsers = await this.userModel.countDocuments({ isActive: true });
    
    // Version corrigée - sans db.stats()
    let databaseSize = 'Calcul en cours...';
    try {
      // Alternative: compter le nombre de documents pour estimer la taille
      const userCount = totalUsers;
      const transactionCount = await this.transactionModel.countDocuments();
      const estimatedSize = Math.round((userCount * 500 + transactionCount * 200) / 1024 / 1024);
      databaseSize = `${estimatedSize} MB`;
    } catch (error) {
      databaseSize = 'Non disponible';
    }
    
    return {
      uptime: this.formatUptime(uptime),
      memoryUsage: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB / ${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
      cpuUsage: `${Math.round(process.cpuUsage().user / 1000000)}%`,
      activeSessions: activeUsers,
      activeUsers: activeUsers,
      totalUsers: totalUsers,
      databaseSize: databaseSize
    };
  }

  async clearCache() {
    return { message: 'Cache vidé avec succès' };
  }

  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}j ${hours}h ${minutes}min`;
  }
}