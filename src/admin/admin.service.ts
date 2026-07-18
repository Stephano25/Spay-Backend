// backend/src/admin/admin.service.ts
import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';
import { User, UserDocument, UserRole } from '../users/schemas/user.schema';
import {
  Transaction,
  TransactionDocument,
  TransactionStatus,
  TransactionType,
} from '../transactions/schemas/transaction.schema';
import { Setting, SettingDocument } from '../settings/schemas/setting.schema';
import { Log, LogDocument } from '../logs/schemas/log.schema';
import { ChatGateway } from '../chat/chat.gateway';
import { I18nService, Language } from '../i18n/i18n.service';

// ============================================================
// CONSTANTES DE COMMISSION
// ============================================================
const COMMISSION_RATES = {
  ADMIN_WITHDRAWAL: {
    SUPER_ADMIN: 0.04,
    ADMIN: 0.03,
  },
  USER_TRANSFER: {
    SUPER_ADMIN: 0.05,
  },
  USER_DEPOSIT: {
    SUPER_ADMIN: 0,
  },
};

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectModel(Setting.name) private settingModel: Model<SettingDocument>,
    @InjectModel(Log.name) private logModel: Model<LogDocument>,
    @Inject(forwardRef(() => ChatGateway)) private chatGateway: ChatGateway,
    private i18nService: I18nService,
  ) {}

  // ============================================================
  // DASHBOARD - Statistiques selon le rôle
  // ============================================================
  async getDashboardStats(userId: string, userRole: string) {
    try {
      this.logger.log(`📊 getDashboardStats pour ${userRole} ${userId}`);

      const isValidAdminId = Types.ObjectId.isValid(userId);
      if (!isValidAdminId) {
        this.logger.warn(
          `⚠️ userId invalide reçu ("${userId}") — les stats globales seront quand même calculées`,
        );
      }

      // ✅ Stats globales
      const [totalUsers, totalTransactions] = await Promise.all([
        this.userModel.countDocuments(),
        this.transactionModel.countDocuments(),
      ]);

      const onlineUserIds = this.chatGateway?.getOnlineUsers() || [];
      const activeUsers = onlineUserIds.length;

      const volumeResult = await this.transactionModel.aggregate([
        { $match: { status: TransactionStatus.COMPLETED } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]);
      const totalVolume = volumeResult[0]?.total || 0;

      const recentUsers = await this.userModel
        .find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('firstName lastName email isActive createdAt language')
        .lean();

      const recentTransactions = await this.transactionModel
        .find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('senderId', 'firstName lastName email language')
        .populate('receiverId', 'firstName lastName email language')
        .lean();

      const dailyStats = await this.buildDailyStats();
      const topUsers = await this.buildTopUsers();

      let totalAdmins = 0;
      let totalSuperAdmins = 0;
      let adminTransactions = 0;
      let adminVolume = 0;

      // ============================================================
      // COMMISSIONS - STATISTIQUES COMPLÈTES AVEC RECHERCHE ÉLARGIE
      // ============================================================
      let totalSuperAdminCommission = 0;
      let totalAdminCommission = 0;
      let totalCommissionTransactions = 0;
      let recentCommissions: any[] = [];
      let adminCommissions: any[] = [];
      let myCommission = 0;
      let myCommissionTransactions = 0;

      if (userRole === UserRole.SUPER_ADMIN) {
        totalAdmins = await this.userModel.countDocuments({ role: UserRole.ADMIN });
        totalSuperAdmins = await this.userModel.countDocuments({ role: UserRole.SUPER_ADMIN });

        // ✅ RECHERCHE ÉLARGIE DES COMMISSIONS
        // 1. Transactions avec commission.total > 0
        // 2. Transactions avec commission.superAdminCommission > 0
        // 3. Transactions avec metadata.hasCommission = true
        // 4. Transactions de type transfer (qui devraient avoir une commission)
        const allCommissionTransactions = await this.transactionModel
          .find({
            status: TransactionStatus.COMPLETED,
            $or: [
              { 'commission.total': { $gt: 0 } },
              { 'commission.superAdminCommission': { $gt: 0 } },
              { 'metadata.hasCommission': true },
              { type: TransactionType.TRANSFER },
            ],
          })
          .sort({ createdAt: -1 })
          .populate('senderId', 'firstName lastName email language')
          .populate('receiverId', 'firstName lastName email language')
          .populate('commission.adminId', 'firstName lastName email')
          .populate('commission.superAdminId', 'firstName lastName email')
          .lean();

        this.logger.log(`💰 Transactions avec commission trouvées: ${allCommissionTransactions.length}`);

        // ✅ Si aucune transaction trouvée, récupérer toutes les transactions et filtrer
        let finalTransactions = allCommissionTransactions;
        if (allCommissionTransactions.length === 0) {
          this.logger.log('💰 Aucune transaction avec commission trouvée, recherche élargie...');
          const allTx = await this.transactionModel
            .find({
              status: TransactionStatus.COMPLETED,
            })
            .sort({ createdAt: -1 })
            .populate('senderId', 'firstName lastName email language')
            .populate('receiverId', 'firstName lastName email language')
            .lean();

          // Filtrer manuellement
          const txWithCommission = allTx.filter(tx => {
            // Vérifier si la transaction a une commission
            if (tx.commission) {
              return tx.commission.total > 0 || 
                     tx.commission.superAdminCommission > 0 || 
                     tx.commission.adminCommission > 0;
            }
            // Vérifier si c'est un transfert (devrait avoir une commission)
            if (tx.type === TransactionType.TRANSFER) {
              return true;
            }
            return false;
          });

          this.logger.log(`💰 Transactions avec commission (filtrage manuel): ${txWithCommission.length}`);
          finalTransactions = txWithCommission;
        }

        totalCommissionTransactions = finalTransactions.length;

        // ✅ Calculer les totaux
        finalTransactions.forEach((tx: any) => {
          if (tx.commission) {
            totalSuperAdminCommission += tx.commission.superAdminCommission || 0;
            totalAdminCommission += tx.commission.adminCommission || 0;
          } else if (tx.type === TransactionType.TRANSFER) {
            // ✅ Si c'est un transfert sans commission explicite, calculer la commission
            const commission = tx.amount * 0.05;
            totalSuperAdminCommission += commission;
            // Ajouter la commission à l'objet pour les logs
            tx.commission = {
              total: commission,
              superAdminCommission: commission,
              adminCommission: 0,
              type: 'user_transfer',
              rate: 5,
              breakdown: `Super Admin: ${commission} Ar (5%)`,
            };
          }
        });

        this.logger.log(`💰 totalSuperAdminCommission: ${totalSuperAdminCommission}`);
        this.logger.log(`💰 totalAdminCommission: ${totalAdminCommission}`);

        // ✅ Regrouper les commissions par Admin
        const adminMap = new Map<string, any>();
        finalTransactions.forEach((tx: any) => {
          const adminId = tx.commission?.adminId?._id?.toString();
          if (adminId && tx.commission && tx.commission.adminCommission > 0) {
            if (!adminMap.has(adminId)) {
              adminMap.set(adminId, {
                adminId: adminId,
                adminName: tx.commission.adminId
                  ? `${tx.commission.adminId.firstName} ${tx.commission.adminId.lastName}`
                  : 'Admin inconnu',
                totalCommission: 0,
                transactionCount: 0,
                commissions: [],
              });
            }
            const entry = adminMap.get(adminId);
            entry.totalCommission += tx.commission.adminCommission;
            entry.transactionCount += 1;
            entry.commissions.push({
              id: tx._id.toString(),
              amount: tx.commission.adminCommission,
              transactionAmount: tx.amount,
              sourceType: tx.commission.type || 'user_transfer',
              createdAt: tx.createdAt,
              userId: tx.senderId?._id?.toString(),
              userName: tx.senderId
                ? `${tx.senderId.firstName} ${tx.senderId.lastName}`
                : 'Utilisateur',
            });
          }
        });
        adminCommissions = Array.from(adminMap.values());
        this.logger.log(`📋 adminCommissions: ${adminCommissions.length}`);

        // ✅ Dernières commissions
        recentCommissions = finalTransactions.slice(0, 10).map((tx: any) => ({
          id: tx._id.toString(),
          amount: tx.commission?.total || tx.amount * 0.05 || 0,
          superAdminAmount: tx.commission?.superAdminCommission || tx.amount * 0.05 || 0,
          adminAmount: tx.commission?.adminCommission || 0,
          transactionAmount: tx.amount,
          sourceType: tx.commission?.type || 'user_transfer',
          sourceUserId: tx.senderId?._id?.toString(),
          userName: tx.senderId
            ? `${tx.senderId.firstName} ${tx.senderId.lastName}`
            : 'Utilisateur',
          adminName: tx.commission?.adminId
            ? `${tx.commission.adminId.firstName} ${tx.commission.adminId.lastName}`
            : 'Admin inconnu',
          createdAt: tx.createdAt,
          rate: tx.commission?.rate || 5,
        }));
        this.logger.log(`📋 recentCommissions: ${recentCommissions.length}`);

        // ✅ Transactions admin
        const adminTxResult = await this.transactionModel.aggregate([
          {
            $match: {
              status: TransactionStatus.COMPLETED,
              'metadata.adminAction': true,
            },
          },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);
        adminVolume = adminTxResult[0]?.total || 0;
        adminTransactions = await this.transactionModel.countDocuments({
          'metadata.adminAction': true,
        });

        // ✅ Commission du Super Admin lui-même
        if (isValidAdminId) {
          const myAdminTx = await this.transactionModel
            .find({
              status: TransactionStatus.COMPLETED,
              'metadata.adminId': new Types.ObjectId(userId),
            })
            .lean();

          myCommissionTransactions = myAdminTx.length;
          myCommission = myAdminTx.reduce((sum, tx) => {
            return sum + (tx.commission?.superAdminCommission || 0);
          }, 0);
        }
      }

      // ============================================================
      // ADMIN NORMAL
      // ============================================================
      if (userRole === UserRole.ADMIN && isValidAdminId) {
        const myTx = await this.transactionModel
          .find({
            status: TransactionStatus.COMPLETED,
            'metadata.adminId': new Types.ObjectId(userId),
          })
          .sort({ createdAt: -1 })
          .populate('senderId', 'firstName lastName email language')
          .populate('receiverId', 'firstName lastName email language')
          .lean();

        myCommissionTransactions = myTx.length;
        myCommission = myTx.reduce((sum, tx) => {
          return sum + (tx.commission?.adminCommission || 0);
        }, 0);

        recentCommissions = myTx.slice(0, 10).map((tx: any) => ({
          id: tx._id.toString(),
          amount: tx.commission?.adminCommission || 0,
          transactionAmount: tx.amount,
          sourceType: tx.commission?.type || 'admin_withdrawal',
          sourceUserId: tx.senderId?._id?.toString(),
          userName: tx.senderId
            ? `${tx.senderId.firstName} ${tx.senderId.lastName}`
            : 'Utilisateur',
          createdAt: tx.createdAt,
          rate: tx.commission?.rate || 0,
        }));

        totalAdminCommission = myCommission;
        totalCommissionTransactions = myCommissionTransactions;
      }

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
          language: u.language || 'fr',
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
                language: (t.senderId as any).language || 'fr',
              }
            : null,
          receiver: t.receiverId
            ? {
                firstName: (t.receiverId as any).firstName,
                lastName: (t.receiverId as any).lastName,
                email: (t.receiverId as any).email,
                language: (t.receiverId as any).language || 'fr',
              }
            : null,
        })),
        dailyStats,
        topUsers,
        totalAdmins,
        totalSuperAdmins,
        adminTransactions,
        adminVolume,
        myAdminTransactions: userRole === UserRole.ADMIN ? myCommissionTransactions : 0,
        myAdminVolume: 0,
        userRole,
        totalSuperAdminCommission,
        totalAdminCommission,
        totalCommissionTransactions,
        recentCommissions,
        adminCommissions,
        myCommission,
        myCommissionTransactions,
        commissionRate: 0.5,
      };
    } catch (error) {
      this.logger.error('❌ Erreur getDashboardStats:', error);
      return this.getEmptyDashboardStats(userRole);
    }
  }

  private getEmptyDashboardStats(userRole: string) {
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
      adminTransactions: 0,
      adminVolume: 0,
      myAdminTransactions: 0,
      myAdminVolume: 0,
      userRole,
      totalSuperAdminCommission: 0,
      totalAdminCommission: 0,
      totalCommissionTransactions: 0,
      recentCommissions: [],
      adminCommissions: [],
      myCommission: 0,
      myCommissionTransactions: 0,
      commissionRate: 0.5,
    };
  }

  // ============================================================
  // STATISTIQUES DES COMMISSIONS
  // ============================================================
  async getCommissionStats(userId: string, userRole: string) {
    try {
      this.logger.log(`💰 getCommissionStats pour ${userRole} ${userId}`);

      let totalSuperAdminCommission = 0;
      let totalAdminCommission = 0;
      let totalCommissionTransactions = 0;
      let recentCommissions: any[] = [];
      let adminCommissions: any[] = [];
      let myCommission = 0;
      let myCommissionTransactions = 0;

      const isValidId = Types.ObjectId.isValid(userId);
      if (!isValidId) {
        this.logger.warn(`⚠️ userId invalide dans getCommissionStats: "${userId}"`);
      }

      if (userRole === UserRole.SUPER_ADMIN) {
        // ✅ RECHERCHE ÉLARGIE
        const allTx = await this.transactionModel
          .find({
            status: TransactionStatus.COMPLETED,
            $or: [
              { 'commission.total': { $gt: 0 } },
              { 'commission.superAdminCommission': { $gt: 0 } },
              { 'metadata.hasCommission': true },
              { type: TransactionType.TRANSFER },
            ],
          })
          .sort({ createdAt: -1 })
          .populate('senderId', 'firstName lastName email language')
          .populate('receiverId', 'firstName lastName email language')
          .populate('commission.adminId', 'firstName lastName email')
          .populate('commission.superAdminId', 'firstName lastName email')
          .lean();

        totalCommissionTransactions = allTx.length;

        allTx.forEach((tx: any) => {
          if (tx.commission) {
            totalSuperAdminCommission += tx.commission.superAdminCommission || 0;
            totalAdminCommission += tx.commission.adminCommission || 0;
          } else if (tx.type === TransactionType.TRANSFER) {
            const commission = tx.amount * 0.05;
            totalSuperAdminCommission += commission;
          }
        });

        const adminMap = new Map<string, any>();
        allTx.forEach((tx: any) => {
          const adminId = tx.commission?.adminId?._id?.toString();
          if (adminId && tx.commission && tx.commission.adminCommission > 0) {
            if (!adminMap.has(adminId)) {
              adminMap.set(adminId, {
                adminId: adminId,
                adminName: tx.commission.adminId
                  ? `${tx.commission.adminId.firstName} ${tx.commission.adminId.lastName}`
                  : 'Admin inconnu',
                totalCommission: 0,
                transactionCount: 0,
                commissions: [],
              });
            }
            const entry = adminMap.get(adminId);
            entry.totalCommission += tx.commission.adminCommission;
            entry.transactionCount += 1;
            entry.commissions.push({
              id: tx._id.toString(),
              amount: tx.commission.adminCommission,
              transactionAmount: tx.amount,
              sourceType: tx.commission.type || 'user_transfer',
              createdAt: tx.createdAt,
              userId: tx.senderId?._id?.toString(),
              userName: tx.senderId
                ? `${tx.senderId.firstName} ${tx.senderId.lastName}`
                : 'Utilisateur',
            });
          }
        });
        adminCommissions = Array.from(adminMap.values());

        recentCommissions = allTx.slice(0, 10).map((tx: any) => ({
          id: tx._id.toString(),
          amount: tx.commission?.total || tx.amount * 0.05 || 0,
          superAdminAmount: tx.commission?.superAdminCommission || tx.amount * 0.05 || 0,
          adminAmount: tx.commission?.adminCommission || 0,
          transactionAmount: tx.amount,
          sourceType: tx.commission?.type || 'user_transfer',
          sourceUserId: tx.senderId?._id?.toString(),
          userName: tx.senderId
            ? `${tx.senderId.firstName} ${tx.senderId.lastName}`
            : 'Utilisateur',
          adminName: tx.commission?.adminId
            ? `${tx.commission.adminId.firstName} ${tx.commission.adminId.lastName}`
            : 'Admin inconnu',
          createdAt: tx.createdAt,
          rate: tx.commission?.rate || 5,
        }));

        if (isValidId) {
          const myTx = await this.transactionModel
            .find({
              status: TransactionStatus.COMPLETED,
              'metadata.adminId': new Types.ObjectId(userId),
            })
            .lean();

          myCommissionTransactions = myTx.length;
          myCommission = myTx.reduce((sum, tx) => {
            return sum + (tx.commission?.superAdminCommission || 0);
          }, 0);
        }
      }

      if (userRole === UserRole.ADMIN && isValidId) {
        const myTx = await this.transactionModel
          .find({
            status: TransactionStatus.COMPLETED,
            'metadata.adminId': new Types.ObjectId(userId),
          })
          .sort({ createdAt: -1 })
          .populate('senderId', 'firstName lastName email language')
          .populate('receiverId', 'firstName lastName email language')
          .lean();

        myCommissionTransactions = myTx.length;
        myCommission = myTx.reduce((sum, tx) => {
          return sum + (tx.commission?.adminCommission || 0);
        }, 0);

        recentCommissions = myTx.slice(0, 10).map((tx: any) => ({
          id: tx._id.toString(),
          amount: tx.commission?.adminCommission || 0,
          transactionAmount: tx.amount,
          sourceType: tx.commission?.type || 'admin_withdrawal',
          sourceUserId: tx.senderId?._id?.toString(),
          userName: tx.senderId
            ? `${tx.senderId.firstName} ${tx.senderId.lastName}`
            : 'Utilisateur',
          createdAt: tx.createdAt,
          rate: tx.commission?.rate || 0,
        }));

        totalAdminCommission = myCommission;
        totalCommissionTransactions = myCommissionTransactions;
      }

      return {
        totalSuperAdminCommission: Math.round(totalSuperAdminCommission * 100) / 100,
        totalAdminCommission: Math.round(totalAdminCommission * 100) / 100,
        totalCommissionTransactions,
        recentCommissions,
        adminCommissions,
        myCommission: Math.round(myCommission * 100) / 100,
        myCommissionTransactions,
        commissionRate: 0.5,
        userRole,
      };
    } catch (error) {
      this.logger.error('❌ Erreur getCommissionStats:', error);
      return {
        totalSuperAdminCommission: 0,
        totalAdminCommission: 0,
        totalCommissionTransactions: 0,
        recentCommissions: [],
        adminCommissions: [],
        myCommission: 0,
        myCommissionTransactions: 0,
        commissionRate: 0.5,
        userRole,
      };
    }
  }

  // ============================================================
  // ADMIN ACTIONS - DÉPÔT ET RETRAIT
  // ============================================================
  async depositMoney(
    adminId: string,
    userId: string,
    amount: number,
    description?: string,
    qrCode?: string,
  ) {
    try {
      this.logger.log(`📝 DEPOSIT - adminId: ${adminId}, userId: ${userId}, amount: ${amount}`);

      if (!Types.ObjectId.isValid(adminId)) {
        this.logger.error(`❌ adminId invalide: ${adminId}`);
        throw new BadRequestException('Session administrateur invalide, veuillez vous reconnecter');
      }

      if (!Types.ObjectId.isValid(userId)) {
        this.logger.error(`❌ userId invalide: ${userId}`);
        throw new NotFoundException('ID utilisateur invalide');
      }

      if (amount <= 0) {
        throw new BadRequestException('Le montant doit être supérieur à 0');
      }

      const admin = await this.userModel.findById(adminId);
      if (!admin) {
        this.logger.error(`❌ Admin non trouvé: ${adminId}`);
        throw new NotFoundException('Administrateur non trouvé');
      }
      this.logger.log(`✅ Admin trouvé: ${admin.email} (${admin.role})`);

      if (admin.role !== UserRole.ADMIN && admin.role !== UserRole.SUPER_ADMIN) {
        this.logger.error(`❌ L'utilisateur ${adminId} n'est pas admin (rôle: ${admin.role})`);
        throw new BadRequestException('Seul un administrateur peut effectuer cette action');
      }

      const user = await this.userModel.findById(userId);
      if (!user) {
        this.logger.error(`❌ Utilisateur cible non trouvé: ${userId}`);
        throw new NotFoundException('Utilisateur non trouvé');
      }
      this.logger.log(`✅ Utilisateur cible trouvé: ${user.email} (balance actuelle: ${user.balance})`);

      if (qrCode) {
        const isValid = await this.validateQRCode(qrCode, 'deposit');
        if (!isValid) {
          throw new BadRequestException('QR Code invalide ou expiré');
        }
      }

      user.balance += amount;
      await user.save();
      this.logger.log(`💰 Nouveau solde de ${user.email}: ${user.balance}`);

      const transaction = await this.transactionModel.create({
        senderId: null,
        receiverId: user._id,
        type: TransactionType.DEPOSIT,
        amount: amount,
        fee: 0,
        commission: {
          total: 0,
          superAdminCommission: 0,
          adminCommission: 0,
          type: 'user_deposit',
          rate: 0,
          breakdown: 'Dépôt utilisateur - 0% commission',
        },
        totalAmount: amount,
        status: TransactionStatus.COMPLETED,
        description: description || `Dépôt administrateur`,
        reference: `ADMIN-DEP-${Date.now()}`,
        paymentMethod: qrCode ? 'qr_code' : 'admin',
        metadata: {
          adminAction: true,
          adminId: new Types.ObjectId(adminId),
          qrCode: qrCode || null,
          commission: 0,
          commissionRate: 0,
          adminEmail: admin.email,
        },
      });
      this.logger.log(`📋 Transaction créée: ${transaction._id}`);

      await this.logModel.create({
        level: 'info',
        message: `Dépôt de ${amount} Ar effectué sur le compte de ${user.email} par admin ${admin.email}`,
        userId: userId,
        date: new Date(),
        metadata: { amount, description, qrCode, adminId: admin.email },
      });

      const userLang = (user.language || 'fr') as Language;
      const depositMessage = this.i18nService.translate(userLang, 'deposit.success', { amount });

      this.chatGateway?.notifyUser(userId, 'balanceUpdate', {
        newBalance: user.balance,
        amount,
        type: 'deposit',
        message: depositMessage,
        title: this.i18nService.translate(userLang, 'notification.deposit'),
      });

      return {
        success: true,
        message: depositMessage,
        newBalance: user.balance,
        commission: 0,
        transaction: this.toTransactionResponse(transaction),
      };
    } catch (error) {
      this.logger.error('❌ Erreur depositMoney:', error);
      throw error;
    }
  }

  async withdrawMoney(
    adminId: string,
    userId: string,
    amount: number,
    description?: string,
    qrCode?: string,
  ) {
    try {
      this.logger.log(`📝 WITHDRAW - adminId: ${adminId}, userId: ${userId}, amount: ${amount}`);

      if (!Types.ObjectId.isValid(adminId)) {
        this.logger.error(`❌ adminId invalide: ${adminId}`);
        throw new BadRequestException('Session administrateur invalide, veuillez vous reconnecter');
      }

      if (!Types.ObjectId.isValid(userId)) {
        this.logger.error(`❌ userId invalide: ${userId}`);
        throw new NotFoundException('ID utilisateur invalide');
      }

      if (amount <= 0) {
        throw new BadRequestException('Le montant doit être supérieur à 0');
      }

      const admin = await this.userModel.findById(adminId);
      if (!admin) {
        this.logger.error(`❌ Admin non trouvé: ${adminId}`);
        throw new NotFoundException('Administrateur non trouvé');
      }
      this.logger.log(`✅ Admin trouvé: ${admin.email} (${admin.role})`);

      const user = await this.userModel.findById(userId);
      if (!user) {
        this.logger.error(`❌ Utilisateur cible non trouvé: ${userId}`);
        throw new NotFoundException('Utilisateur non trouvé');
      }
      this.logger.log(`✅ Utilisateur cible trouvé: ${user.email} (balance: ${user.balance})`);

      const superAdmin = await this.userModel.findOne({ role: UserRole.SUPER_ADMIN });
      if (!superAdmin) {
        throw new NotFoundException('Super Administrateur non trouvé');
      }
      this.logger.log(`✅ Super Admin trouvé: ${superAdmin.email}`);

      const superAdminCommission = amount * COMMISSION_RATES.ADMIN_WITHDRAWAL.SUPER_ADMIN;
      const adminCommission = amount * COMMISSION_RATES.ADMIN_WITHDRAWAL.ADMIN;
      const totalCommission = superAdminCommission + adminCommission;
      const totalDeducted = amount + totalCommission;
      this.logger.log(`💰 Commissions: SuperAdmin=${superAdminCommission}, Admin=${adminCommission}, Total=${totalCommission}`);

      if (user.balance < totalDeducted) {
        const userLang = (user.language || 'fr') as Language;
        throw new BadRequestException(
          this.i18nService.translate(userLang, 'error.insufficient_balance') +
          ` (${totalDeducted} Ar requis dont ${totalCommission} Ar de commissions)`,
        );
      }

      if (qrCode) {
        const isValid = await this.validateQRCode(qrCode, 'withdraw');
        if (!isValid) {
          throw new BadRequestException('QR Code invalide ou expiré');
        }
      }

      user.balance -= totalDeducted;
      await user.save();
      this.logger.log(`💰 Nouveau solde de ${user.email}: ${user.balance}`);

      superAdmin.balance += superAdminCommission;
      await superAdmin.save();
      this.logger.log(`💰 Super Admin ${superAdmin.email} reçoit ${superAdminCommission} Ar`);

      const adminUser = await this.userModel.findById(adminId);
      if (adminUser) {
        adminUser.balance += adminCommission;
        await adminUser.save();
        this.logger.log(`💰 Admin ${adminUser.email} reçoit ${adminCommission} Ar`);
      }

      const transaction = await this.transactionModel.create({
        senderId: user._id,
        receiverId: null,
        type: TransactionType.WITHDRAWAL,
        amount: amount,
        fee: totalCommission,
        commission: {
          total: totalCommission,
          superAdminCommission: superAdminCommission,
          adminCommission: adminCommission,
          superAdminId: superAdmin._id,
          adminId: new Types.ObjectId(adminId),
          type: 'admin_withdrawal',
          rate: 4,
          breakdown: `Super Admin: ${superAdminCommission} Ar (4%) + Admin: ${adminCommission} Ar (3%)`,
        },
        totalAmount: totalDeducted,
        status: TransactionStatus.COMPLETED,
        description: description || `Retrait administrateur`,
        reference: `ADMIN-WTH-${Date.now()}`,
        paymentMethod: qrCode ? 'qr_code' : 'admin',
        metadata: {
          adminAction: true,
          adminId: new Types.ObjectId(adminId),
          qrCode: qrCode || null,
          superAdminCommission: superAdminCommission,
          adminCommission: adminCommission,
          totalCommission: totalCommission,
          commissionRate: 4,
          adminEmail: admin.email,
          superAdminEmail: superAdmin.email,
        },
      });
      this.logger.log(`📋 Transaction créée: ${transaction._id}`);

      await this.logModel.create({
        level: 'info',
        message: `Retrait de ${amount} Ar effectué sur le compte de ${user.email} par admin ${admin.email} (commissions: Super Admin=${superAdminCommission} Ar, Admin=${adminCommission} Ar)`,
        userId: userId,
        date: new Date(),
        metadata: { amount, description, qrCode, adminId: admin.email, superAdminCommission, adminCommission },
      });

      const userLang = (user.language || 'fr') as Language;
      const withdrawalMessage = this.i18nService.translate(userLang, 'withdrawal.success', { amount });
      const commissionMessage = `Commissions: ${totalCommission} Ar`;

      this.chatGateway?.notifyUser(userId, 'balanceUpdate', {
        newBalance: user.balance,
        amount: totalDeducted,
        type: 'withdrawal',
        message: withdrawalMessage,
        commissionMessage: commissionMessage,
        title: this.i18nService.translate(userLang, 'notification.withdrawal'),
      });

      return {
        success: true,
        message: `${withdrawalMessage} (${commissionMessage})`,
        newBalance: user.balance,
        commission: totalCommission,
        superAdminCommission: superAdminCommission,
        adminCommission: adminCommission,
        transaction: this.toTransactionResponse(transaction),
      };
    } catch (error) {
      this.logger.error('❌ Erreur withdrawMoney:', error);
      throw error;
    }
  }

  // ============================================================
  // MÉTHODES DE RÉCUPÉRATION
  // ============================================================
  async getRecentTransactions(limit: number = 10): Promise<any[]> {
    return this.transactionModel
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('senderId', 'firstName lastName email')
      .populate('receiverId', 'firstName lastName email')
      .exec();
  }

  async getRecentUsers(limit: number = 10): Promise<any[]> {
    return this.userModel
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('-password')
      .exec();
  }

  // ============================================================
  // UTILISATEURS
  // ============================================================
  async getAllUsers(page: number = 1, limit: number = 20, search?: string): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.userModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-password')
        .exec(),
      this.userModel.countDocuments(query),
    ]);

    return {
      data: users.map((u) => this.toUserResponse(u)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAllUsersSimple() {
    const users = await this.userModel
      .find()
      .select('-password')
      .sort({ createdAt: -1 });
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

  async updateUser(id: string, updateData: any): Promise<any> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('ID utilisateur invalide');
    }
    const user = await this.userModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .select('-password');
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    return this.toUserResponse(user);
  }

  async updateUserStatus(userId: string, isActive: boolean) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('ID utilisateur invalide');
    }
    const user = await this.userModel
      .findByIdAndUpdate(userId, { isActive }, { new: true })
      .select('-password');
    if (!user) throw new NotFoundException('Utilisateur non trouvé');
    return this.toUserResponse(user);
  }

  async activateUser(id: string): Promise<any> {
    return this.updateUserStatus(id, true);
  }

  async deactivateUser(id: string): Promise<any> {
    return this.updateUserStatus(id, false);
  }

  async updateUserRole(userId: string, role: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('ID utilisateur invalide');
    }
    const validRoles = Object.values(UserRole) as string[];
    if (!validRoles.includes(role)) {
      throw new NotFoundException(`Rôle invalide : ${role}`);
    }
    const user = await this.userModel
      .findByIdAndUpdate(userId, { role }, { new: true })
      .select('-password');
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

  async updateUserBalance(id: string, amount: number, operation: 'add' | 'subtract' | 'set'): Promise<any> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('ID utilisateur invalide');
    }

    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    switch (operation) {
      case 'add':
        user.balance += amount;
        break;
      case 'subtract':
        if (user.balance < amount) {
          throw new BadRequestException('Solde insuffisant');
        }
        user.balance -= amount;
        break;
      case 'set':
        if (amount < 0) {
          throw new BadRequestException('Le solde ne peut pas être négatif');
        }
        user.balance = amount;
        break;
    }

    await user.save();
    return { success: true, balance: user.balance };
  }

  // ============================================================
  // TRANSACTIONS
  // ============================================================
  async getAllTransactions(
    page: number = 1,
    limit: number = 20,
    userId?: string,
    type?: string,
    status?: string,
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (userId && Types.ObjectId.isValid(userId)) {
      query.$or = [
        { senderId: new Types.ObjectId(userId) },
        { receiverId: new Types.ObjectId(userId) },
      ];
    }
    if (type) query.type = type;
    if (status) query.status = status;

    const [transactions, total] = await Promise.all([
      this.transactionModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('senderId', 'firstName lastName email')
        .populate('receiverId', 'firstName lastName email')
        .exec(),
      this.transactionModel.countDocuments(query),
    ]);

    return {
      data: transactions,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAllTransactionsSimple() {
    return this.transactionModel
      .find()
      .populate('senderId', 'firstName lastName email language')
      .populate('receiverId', 'firstName lastName email language')
      .sort({ createdAt: -1 });
  }

  async getTransactionById(transactionId: string) {
    if (!Types.ObjectId.isValid(transactionId)) {
      throw new NotFoundException('ID transaction invalide');
    }
    const transaction = await this.transactionModel
      .findById(transactionId)
      .populate('senderId', 'firstName lastName email language')
      .populate('receiverId', 'firstName lastName email language');
    if (!transaction) {
      throw new NotFoundException('Transaction non trouvée');
    }
    return transaction;
  }

  async updateTransactionStatus(id: string, status: string, reason?: string): Promise<any> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('ID transaction invalide');
    }

    const transaction = await this.transactionModel.findById(id);
    if (!transaction) {
      throw new NotFoundException('Transaction non trouvée');
    }

    const validStatuses = ['pending', 'completed', 'failed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(`Statut invalide: ${status}`);
    }

    transaction.status = status as TransactionStatus;
    if (reason) {
      (transaction as any).rejectionReason = reason;
    }
    await transaction.save();

    return transaction;
  }

  // ============================================================
  // QR CODE
  // ============================================================
  async generateQRCode(adminId: string, type: 'deposit' | 'withdraw', amount?: number) {
    if (!Types.ObjectId.isValid(adminId)) {
      throw new BadRequestException('Session administrateur invalide, veuillez vous reconnecter');
    }

    const admin = await this.userModel.findById(adminId);
    if (!admin) {
      throw new NotFoundException('Administrateur non trouvé');
    }

    const qrData = {
      type: 'admin_transaction',
      action: type,
      adminId: adminId,
      adminName: `${admin.firstName} ${admin.lastName}`,
      amount: amount || null,
      timestamp: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      signature: crypto
        .createHash('sha256')
        .update(`${adminId}-${type}-${amount}-${Date.now()}`)
        .digest('hex')
        .substring(0, 16),
    };

    const qrString = JSON.stringify(qrData);
    const qrCodeImage = await QRCode.toDataURL(qrString);

    return {
      qrCode: qrString,
      qrCodeImage,
      expiresAt: qrData.expiresAt,
      action: type,
      amount: amount || null,
    };
  }

  async scanQRCode(adminId: string, qrData: string) {
    try {
      const parsed = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;

      if (parsed.expiresAt && new Date(parsed.expiresAt) < new Date()) {
        throw new BadRequestException('QR Code expiré');
      }

      if (parsed.type !== 'admin_transaction') {
        throw new BadRequestException('QR Code invalide pour une transaction admin');
      }

      const expectedSignature = crypto
        .createHash('sha256')
        .update(
          `${parsed.adminId}-${parsed.action}-${parsed.amount || ''}-${new Date(parsed.timestamp).getTime()}`,
        )
        .digest('hex')
        .substring(0, 16);

      if (parsed.signature !== expectedSignature) {
        throw new BadRequestException('QR Code invalide');
      }

      return {
        valid: true,
        action: parsed.action,
        adminId: parsed.adminId,
        adminName: parsed.adminName,
        amount: parsed.amount,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('QR Code invalide');
    }
  }

  private async validateQRCode(qrCode: string, expectedAction: string): Promise<boolean> {
    try {
      const parsed = JSON.parse(qrCode);
      if (parsed.type !== 'admin_transaction' || parsed.action !== expectedAction) {
        return false;
      }
      if (parsed.expiresAt && new Date(parsed.expiresAt) < new Date()) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================
  // ADMINISTRATEURS
  // ============================================================
  async createAdmin(adminData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phoneNumber?: string;
    role?: 'admin' | 'super_admin';
  }) {
    const existingUser = await this.userModel.findOne({
      email: adminData.email.toLowerCase(),
    });
    if (existingUser) {
      throw new BadRequestException('Cet email est déjà utilisé');
    }

    const hashedPassword = await bcrypt.hash(adminData.password, 10);
    const qrCode = await this.generateUniqueQrCode();

    const newAdmin = new this.userModel({
      email: adminData.email.toLowerCase(),
      password: hashedPassword,
      firstName: adminData.firstName,
      lastName: adminData.lastName,
      phoneNumber: adminData.phoneNumber,
      qrCode,
      balance: 0,
      role: adminData.role || UserRole.ADMIN,
      isActive: true,
      isGoogleUser: false,
      createdAt: new Date(),
      language: 'fr',
    });

    await newAdmin.save();

    await this.logModel.create({
      level: 'info',
      message: `Nouvel administrateur créé : ${adminData.email} (${adminData.role || 'admin'})`,
      date: new Date(),
      metadata: { email: adminData.email, role: adminData.role || 'admin' },
    });

    return {
      success: true,
      message: 'Administrateur créé avec succès',
      user: this.toUserResponse(newAdmin),
    };
  }

  async getAdmins() {
    const admins = await this.userModel
      .find({
        $or: [{ role: UserRole.ADMIN }, { role: UserRole.SUPER_ADMIN }],
      })
      .select('-password')
      .sort({ createdAt: -1 });

    return admins.map((u) => this.toUserResponse(u));
  }

  async deleteAdmin(adminId: string, currentAdminId: string) {
    if (adminId === currentAdminId) {
      throw new BadRequestException('Vous ne pouvez pas vous supprimer vous-même');
    }

    if (!Types.ObjectId.isValid(adminId)) {
      throw new NotFoundException('ID invalide');
    }

    const admin = await this.userModel.findById(adminId);
    if (!admin) {
      throw new NotFoundException('Administrateur non trouvé');
    }

    if (admin.role !== UserRole.ADMIN && admin.role !== UserRole.SUPER_ADMIN) {
      throw new BadRequestException("Cet utilisateur n'est pas un administrateur");
    }

    await this.userModel.findByIdAndDelete(adminId);

    await this.logModel.create({
      level: 'info',
      message: `Administrateur supprimé : ${admin.email}`,
      date: new Date(),
      metadata: { deletedAdmin: admin.email },
    });

    return {
      success: true,
      message: 'Administrateur supprimé avec succès',
    };
  }

  // ============================================================
  // PROFIL ADMIN
  // ============================================================
  async getAdminProfile(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('ID administrateur invalide');
    }
    const user = await this.userModel.findById(userId).select('-password');
    if (!user) throw new NotFoundException('Administrateur non trouvé');
    return this.toUserResponse(user);
  }

  async updateAdminProfile(userId: string, updateData: any) {
    const allowedFields = ['firstName', 'lastName', 'email', 'phoneNumber', 'bio', 'language'];
    const sanitized: any = {};
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        sanitized[field] = updateData[field];
      }
    }

    const user = await this.userModel
      .findByIdAndUpdate(userId, sanitized, { new: true })
      .select('-password');
    if (!user) throw new NotFoundException('Administrateur non trouvé');
    return this.toUserResponse(user);
  }

  // ============================================================
  // PARAMÈTRES SYSTÈME
  // ============================================================
  async getSettings(user?: any) {
    try {
      let settings = await this.settingModel.findOne();
      if (!settings) {
        settings = await this.settingModel.create(this.getDefaultSettings());
      }

      const settingsObj = settings.toObject ? settings.toObject() : settings;

      if (user && user.role === UserRole.ADMIN) {
        const sanitized = { ...settingsObj };
        const sensitiveFields = ['apiKeys', 'secrets', 'smtpPassword', 'jwtSecret', 'encryptionKey'];
        for (const field of sensitiveFields) {
          if (sanitized.securityAdvanced && field in sanitized.securityAdvanced) {
            delete sanitized.securityAdvanced[field];
          }
        }
        if (sanitized.securityAdvanced) {
          const { rateLimit, ...rest } = sanitized.securityAdvanced;
          sanitized.securityAdvanced = { rateLimit };
        }
        return sanitized;
      }

      return settingsObj;
    } catch (error) {
      this.logger.error('❌ Erreur getSettings:', error);
      return this.getDefaultSettings();
    }
  }

  private getDefaultSettings() {
    return {
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
        defaultLanguage: 'fr',
        supportedLanguages: ['fr', 'en', 'mg'],
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
        adminPasswordReset: false,
        passwordResetTokenExpiry: 3600,
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
        commissionRate: 0.5,
        maxCommission: 50000,
      },
      notification: {
        emailNotifications: true,
        smsNotifications: false,
        pushNotifications: true,
        adminAlerts: {
          newUser: true,
          newTransaction: true,
          largeTransaction: true,
          securityAlert: true,
          systemError: true,
        },
        emailFrequency: 'instant',
      },
      customization: {
        theme: 'light',
        primaryColor: '#7c3aed',
        secondaryColor: '#4f46e5',
        logo: null,
        favicon: null,
        customCSS: '',
        customJS: '',
      },
      securityAdvanced: {
        rateLimit: {
          enabled: true,
          maxRequests: 100,
          timeWindow: 60,
        },
      },
      logging: {
        enabled: true,
        level: 'info',
        retentionDays: 30,
        maxFileSize: 50,
      },
      cache: {
        enabled: true,
        ttl: 3600,
        maxSize: 100,
      },
    };
  }

  async updateSettings(settingsData: any, user?: any) {
    try {
      if (!settingsData || typeof settingsData !== 'object') {
        throw new BadRequestException('Données de paramètres invalides');
      }

      if (user && user.role === UserRole.ADMIN) {
        const sensitiveFields = ['apiKeys', 'secrets', 'smtpPassword', 'jwtSecret', 'encryptionKey'];
        for (const field of sensitiveFields) {
          if (settingsData.securityAdvanced && field in settingsData.securityAdvanced) {
            delete settingsData.securityAdvanced[field];
          }
        }
        if (settingsData.security) {
          const allowedSecurityFields = [
            'twoFactorAuth',
            'requireEmailVerification',
            'requirePhoneVerification',
          ];
          const filteredSecurity: any = {};
          for (const field of allowedSecurityFields) {
            if (settingsData.security[field] !== undefined) {
              filteredSecurity[field] = settingsData.security[field];
            }
          }
          settingsData.security = filteredSecurity;
        }
        if (settingsData.securityAdvanced) {
          if (settingsData.securityAdvanced.rateLimit) {
            settingsData.securityAdvanced = {
              rateLimit: settingsData.securityAdvanced.rateLimit,
            };
          } else {
            delete settingsData.securityAdvanced;
          }
        }
      }

      let settings = await this.settingModel.findOne();
      if (!settings) {
        const defaultSettings = this.getDefaultSettings();
        settings = await this.settingModel.create({
          ...defaultSettings,
          ...settingsData,
        });
      } else {
        Object.assign(settings, settingsData);
        await settings.save();
      }

      await this.logModel.create({
        level: 'info',
        message: `Paramètres système mis à jour par ${user?.email || 'Admin'}`,
        date: new Date(),
        metadata: {
          userRole: user?.role || 'unknown',
          updatedFields: Object.keys(settingsData),
        },
      });

      return settings;
    } catch (error) {
      this.logger.error('❌ Erreur updateSettings:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Erreur lors de la mise à jour des paramètres');
    }
  }

  // ============================================================
  // STATISTIQUES AVANCÉES
  // ============================================================
  async getRevenueStats(period: 'day' | 'week' | 'month' | 'year' = 'month'): Promise<any> {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.setDate(now.getDate() - 1));
        break;
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      case 'year':
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
      default:
        startDate = new Date(now.setMonth(now.getMonth() - 1));
    }

    const revenue = await this.transactionModel.aggregate([
      {
        $match: {
          status: TransactionStatus.COMPLETED,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return {
      period,
      data: revenue,
      total: revenue.reduce((sum, item) => sum + item.total, 0),
    };
  }

  async getUserGrowthStats(period: 'day' | 'week' | 'month' | 'year' = 'month'): Promise<any> {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.setDate(now.getDate() - 1));
        break;
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      case 'year':
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
      default:
        startDate = new Date(now.setMonth(now.getMonth() - 1));
    }

    const growth = await this.userModel.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return {
      period,
      data: growth,
      total: growth.reduce((sum, item) => sum + item.count, 0),
    };
  }

  async getTransactionVolumeStats(period: 'day' | 'week' | 'month' | 'year' = 'month'): Promise<any> {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.setDate(now.getDate() - 1));
        break;
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      case 'year':
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
      default:
        startDate = new Date(now.setMonth(now.getMonth() - 1));
    }

    const volume = await this.transactionModel.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return {
      period,
      data: volume,
      totalTransactions: volume.reduce((sum, item) => sum + item.count, 0),
      totalAmount: volume.reduce((sum, item) => sum + item.totalAmount, 0),
    };
  }

  // ============================================================
  // LOGS & STATS SYSTÈME
  // ============================================================
  async getSystemLogs(page: number = 1, limit: number = 50, type?: string, from?: string, to?: string) {
    try {
      const query: any = {};
      if (type) query.type = type;
      if (from) query.date = { $gte: new Date(from) };
      if (to) query.date = { ...query.date, $lte: new Date(to) };

      const logs = await this.logModel
        .find(query)
        .sort({ date: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

      const total = await this.logModel.countDocuments(query);

      return {
        data: logs,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error('❌ Erreur getSystemLogs:', error);
      return { data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } };
    }
  }

  async clearLogs(olderThan?: string): Promise<any> {
    const query: any = {};
    if (olderThan) {
      const date = new Date(olderThan);
      if (!isNaN(date.getTime())) {
        query.date = { $lt: date };
      }
    }
    const result = await this.logModel.deleteMany(query);
    return { success: true, message: 'Logs effacés avec succès', deletedCount: result.deletedCount };
  }

  async getSystemStats() {
    try {
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
        apiCalls: await this.getApiCallsCount(),
      };
    } catch (error) {
      this.logger.error('❌ Erreur getSystemStats:', error);
      return {
        uptime: '0j 0h 0min',
        memoryUsage: '0 MB / 0 MB',
        cpuUsage: '0%',
        activeSessions: 0,
        activeUsers: 0,
        totalUsers: 0,
        totalTransactions: 0,
        databaseSize: '0 MB',
        apiCalls: 0,
      };
    }
  }

  private async getApiCallsCount(): Promise<number> {
    try {
      const count = await this.logModel.countDocuments({ type: 'api' });
      return count || 0;
    } catch {
      return 0;
    }
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
      language: user.language || 'fr',
    };
  }

  private toTransactionResponse(tx: any) {
    return {
      id: tx._id.toString(),
      amount: tx.amount,
      type: tx.type,
      status: tx.status,
      description: tx.description,
      reference: tx.reference,
      createdAt: tx.createdAt,
      commission: tx.commission || 0,
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

  private async generateUniqueQrCode(): Promise<string> {
    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidate = `SPAYE-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
      const existing = await this.userModel.findOne({ qrCode: candidate });
      if (!existing) {
        return candidate;
      }
    }
    return `SPAYE-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
  }
}