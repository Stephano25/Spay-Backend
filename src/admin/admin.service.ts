import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument, UserRole } from '../users/schemas/user.schema';
import { Transaction, TransactionDocument, TransactionStatus } from '../transactions/schemas/transaction.schema';
import { Setting, SettingDocument } from '../settings/schemas/setting.schema';
import { Log, LogDocument } from '../logs/schemas/log.schema';
import { ChatGateway } from '../chat/chat.gateway';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectModel(Setting.name) private settingModel: Model<SettingDocument>,
    @InjectModel(Log.name) private logModel: Model<LogDocument>,
    @Inject(forwardRef(() => ChatGateway)) private chatGateway: ChatGateway,
  ) {}

  // ============================================================
  // DASHBOARD
  // ============================================================
  async getDashboardStats() {
    const [totalUsers, totalTransactions] = await Promise.all([
      this.userModel.countDocuments(),
      this.transactionModel.countDocuments(),
    ]);

    // 🔥 Utilisateurs connectés en temps réel via WebSocket
    const onlineUserIds = this.chatGateway.getOnlineUsers();
    const activeUsers = onlineUserIds.length;

    console.log(`📊 Utilisateurs en ligne : ${activeUsers} (${onlineUserIds.join(', ')})`);

    const volumeResult = await this.transactionModel.aggregate([
      { $match: { status: TransactionStatus.COMPLETED } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const totalVolume = volumeResult[0]?.total || 0;

    const recentUsers = await this.userModel
      .find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('firstName lastName email isActive createdAt')
      .lean();

    const recentTransactions = await this.transactionModel
      .find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('senderId', 'firstName lastName email')
      .populate('receiverId', 'firstName lastName email')
      .lean();

    const dailyStats = await this.buildDailyStats();
    const topUsers = await this.buildTopUsers();

    return {
      totalUsers,
      activeUsers,
      totalTransactions,
      totalVolume,
      recentUsers: recentUsers.map((u: any) => ({
        id: u._id.toString(),
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        isActive: u.isActive,
        createdAt: u.createdAt,
      })),
      recentTransactions: recentTransactions.map((t: any) => ({
        id: t._id.toString(),
        type: t.type,
        amount: t.amount,
        status: t.status,
        createdAt: t.createdAt,
        sender: t.senderId
          ? {
              firstName: (t.senderId as any).firstName,
              lastName: (t.senderId as any).lastName,
              email: (t.senderId as any).email,
            }
          : null,
        receiver: t.receiverId
          ? {
              firstName: (t.receiverId as any).firstName,
              lastName: (t.receiverId as any).lastName,
              email: (t.receiverId as any).email,
            }
          : null,
      })),
      dailyStats,
      topUsers,
    };
  }

  // ============================================================
  // UTILISATEURS
  // ============================================================
  async getAllUsers() {
    const users = await this.userModel.find().select('-password').sort({ createdAt: -1 });
    return users.map((u) => this.toUserResponse(u));
  }

  async getUserById(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('ID utilisateur invalide');
    }
    const user = await this.userModel.findById(userId).select('-password');
    if (!user) throw new NotFoundException('Utilisateur non trouvé');
    return this.toUserResponse(user);
  }

  async updateUserStatus(userId: string, isActive: boolean) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('ID utilisateur invalide');
    }
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { isActive },
      { new: true },
    ).select('-password');
    if (!user) throw new NotFoundException('Utilisateur non trouvé');
    return this.toUserResponse(user);
  }

  async updateUserRole(userId: string, role: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('ID utilisateur invalide');
    }
    const validRoles = Object.values(UserRole) as string[];
    if (!validRoles.includes(role)) {
      throw new NotFoundException(`Rôle invalide : ${role}`);
    }
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { role },
      { new: true },
    ).select('-password');
    if (!user) throw new NotFoundException('Utilisateur non trouvé');
    return this.toUserResponse(user);
  }

  async deleteUser(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('ID utilisateur invalide');
    }
    const user = await this.userModel.findByIdAndDelete(userId);
    if (!user) throw new NotFoundException('Utilisateur non trouvé');
    return { message: 'Utilisateur supprimé avec succès' };
  }

  // ============================================================
  // TRANSACTIONS
  // ============================================================
  async getAllTransactions() {
    return this.transactionModel
      .find()
      .populate('senderId', 'firstName lastName email')
      .populate('receiverId', 'firstName lastName email')
      .sort({ createdAt: -1 });
  }

  async getTransactionById(transactionId: string) {
    if (!Types.ObjectId.isValid(transactionId)) {
      throw new NotFoundException('ID transaction invalide');
    }
    const transaction = await this.transactionModel
      .findById(transactionId)
      .populate('senderId', 'firstName lastName email')
      .populate('receiverId', 'firstName lastName email');
    if (!transaction) {
      throw new NotFoundException('Transaction non trouvée');
    }
    return transaction;
  }

  // ============================================================
  // PARAMÈTRES SYSTÈME
  // ============================================================
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
          sessionTimeout: 30,
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
          requirePhoneVerification: false,
        },
        payment: {
          minTransaction: 100,
          maxTransaction: 5000000,
          dailyTransferLimit: 5000000,
          monthlyTransferLimit: 50000000,
          mobileMoneyEnabled: true,
          mobileMoneyOperators: { airtel: true, orange: true, mvola: true },
          transferFees: { airtel: 0.5, orange: 0.5, mvola: 0.5, internal: 0 },
          currency: 'Ar',
        },
      });
    }
    return settings;
  }

  async updateSettings(settingsData: any) {
    const settings = await this.settingModel.findOne();
    if (!settings) {
      return this.settingModel.create(settingsData);
    }
    Object.assign(settings, settingsData);
    await settings.save();
    return settings;
  }

  // ============================================================
  // LOGS & STATS SYSTÈME
  // ============================================================
  async getSystemLogs() {
    return this.logModel.find().sort({ date: -1 }).limit(50);
  }

  async getSystemStats() {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    const [totalUsers, activeUsers, totalTransactions] = await Promise.all([
      this.userModel.countDocuments(),
      this.userModel.countDocuments({ isActive: true }),
      this.transactionModel.countDocuments(),
    ]);

    let databaseSize = 'Calcul en cours...';
    try {
      const estimatedSize = Math.round((totalUsers * 500 + totalTransactions * 200) / 1024 / 1024);
      databaseSize = `${estimatedSize} MB`;
    } catch {
      databaseSize = 'Non disponible';
    }

    return {
      uptime: this.formatUptime(uptime),
      memoryUsage: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB / ${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
      cpuUsage: `${Math.round(process.cpuUsage().user / 1000000)}%`,
      activeSessions: activeUsers,
      activeUsers,
      totalUsers,
      totalTransactions,
      databaseSize,
    };
  }

  async clearCache() {
    await this.logModel.create({
      level: 'info',
      message: 'Cache système vidé par un administrateur',
      date: new Date(),
    });
    return { message: 'Cache vidé avec succès' };
  }

  // ============================================================
  // HELPERS PRIVÉS
  // ============================================================

  private toUserResponse(user: UserDocument) {
    return {
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      balance: user.balance,
      qrCode: user.qrCode,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      bio: user.bio,
    };
  }

  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}j ${hours}h ${minutes}min`;
  }

  private async buildDailyStats() {
    const stats = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);

      const [users, transactions] = await Promise.all([
        this.userModel.countDocuments({ createdAt: { $gte: start, $lte: end } }),
        this.transactionModel.find({
          createdAt: { $gte: start, $lte: end },
          status: TransactionStatus.COMPLETED,
        }),
      ]);

      const volume = transactions.reduce((sum, t) => sum + t.amount, 0);
      stats.push({
        date: start.toISOString().slice(0, 10),
        users,
        transactions: transactions.length,
        volume,
      });
    }
    return stats;
  }

  private async buildTopUsers() {
    const result = await this.transactionModel.aggregate([
      { $match: { status: TransactionStatus.COMPLETED } },
      {
        $group: {
          _id: '$senderId',
          transactionCount: { $sum: 1 },
          totalVolume: { $sum: '$amount' },
        },
      },
      { $sort: { totalVolume: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          userId: '$_id',
          name: {
            $concat: ['$user.firstName', ' ', '$user.lastName'],
          },
          transactionCount: 1,
          totalVolume: 1,
        },
      },
    ]);
    return result;
  }
}