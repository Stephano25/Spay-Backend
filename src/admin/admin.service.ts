import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Transaction, TransactionDocument } from '../transactions/schemas/transaction.schema';
import { DailyStat, AdminDashboardStats, TopUser } from './admin.types'; // IMPORTER LES TYPES

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
  ) {}

  async getDashboardStats(): Promise<AdminDashboardStats> {
    console.log('📊 Calcul des statistiques dashboard...');
    
    try {
      const [totalUsers, activeUsers, totalTransactions, totalVolumeResult, recentUsers, recentTransactions, dailyStats, topUsers] = await Promise.all([
        this.userModel.countDocuments().exec(),
        this.getActiveUsersCount(),
        this.transactionModel.countDocuments().exec(),
        this.getTotalVolume(),
        this.getRecentUsers(),
        this.getRecentTransactions(),
        this.getDailyStats(),
        this.getTopUsers()
      ]);

      const result = {
        totalUsers,
        activeUsers,
        totalTransactions,
        totalVolume: totalVolumeResult,
        recentUsers,
        recentTransactions,
        dailyStats,
        topUsers
      };

      console.log('✅ Statistiques calculées:', result);
      return result;

    } catch (error) {
      console.error('❌ Erreur dans getDashboardStats:', error);
      throw error;
    }
  }

  private async getActiveUsersCount(): Promise<number> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    return this.userModel.countDocuments({
      lastLogin: { $gte: yesterday }
    }).exec();
  }

  private async getTotalVolume(): Promise<number> {
    const result = await this.transactionModel.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]).exec();
    
    return result.length > 0 ? result[0].total : 0;
  }

  private async getRecentUsers(): Promise<any[]> {
    return this.userModel.find()
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()
      .exec();
  }

  private async getRecentTransactions(): Promise<any[]> {
    return this.transactionModel.find()
      .populate('senderId', 'firstName lastName email')
      .populate('receiverId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()
      .exec();
  }

  private async getDailyStats(): Promise<DailyStat[]> {
    const days = 7;
    const stats: DailyStat[] = [];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);

      const users = await this.userModel.countDocuments({
        createdAt: { $gte: date, $lt: nextDay }
      }).exec();

      const transactions = await this.transactionModel.countDocuments({
        createdAt: { $gte: date, $lt: nextDay }
      }).exec();

      const volumeResult = await this.transactionModel.aggregate([
        {
          $match: {
            createdAt: { $gte: date, $lt: nextDay },
            status: 'completed'
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).exec();

      const options: Intl.DateTimeFormatOptions = { weekday: 'short' };
      const formattedDate = date.toLocaleDateString('fr-MG', options);

      stats.push({
        date: formattedDate,
        users,
        transactions,
        volume: volumeResult.length > 0 ? volumeResult[0].total : 0
      });
    }

    return stats;
  }

  private async getTopUsers(): Promise<TopUser[]> {
    const result = await this.transactionModel.aggregate([
      { $match: { status: 'completed' } },
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
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          userId: '$_id',
          name: {
            $concat: [
              { $ifNull: ['$user.firstName', 'Utilisateur'] },
              ' ',
              { $ifNull: ['$user.lastName', ''] }
            ]
          },
          transactionCount: 1,
          totalVolume: 1
        }
      }
    ]).exec();

    return result as TopUser[];
  }

  async getAllUsers() {
    return this.userModel.find().select('-password').sort({ createdAt: -1 }).lean().exec();
  }

  async getAllTransactions() {
    return this.transactionModel.find()
      .populate('senderId', 'firstName lastName email')
      .populate('receiverId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }
}