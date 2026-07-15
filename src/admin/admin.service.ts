// src/admin/admin.service.ts
import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument, UserRole } from '../users/schemas/user.schema';
import {
  Transaction,
  TransactionDocument,
  TransactionStatus,
} from '../transactions/schemas/transaction.schema';
import { Setting, SettingDocument } from '../settings/schemas/setting.schema';
import { Log, LogDocument } from '../logs/schemas/log.schema';
import { ChatGateway } from '../chat/chat.gateway';
import { I18nService, Language } from '../i18n/i18n.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';

@Injectable()
export class AdminService {
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
      if (!Types.ObjectId.isValid(userId)) {
        console.warn('⚠️ ID utilisateur invalide pour getDashboardStats');
        return this.getEmptyDashboardStats(userRole);
      }

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

      if (userRole === 'super_admin') {
        totalAdmins = await this.userModel.countDocuments({ role: 'admin' });
        totalSuperAdmins = await this.userModel.countDocuments({ role: 'super_admin' });

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
      }

      let myAdminTransactions = 0;
      let myAdminVolume = 0;
      if (userRole === 'admin' && Types.ObjectId.isValid(userId)) {
        const myTxResult = await this.transactionModel.aggregate([
          {
            $match: {
              status: TransactionStatus.COMPLETED,
              'metadata.adminId': new Types.ObjectId(userId),
            },
          },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);
        myAdminVolume = myTxResult[0]?.total || 0;
        myAdminTransactions = await this.transactionModel.countDocuments({
          'metadata.adminId': new Types.ObjectId(userId),
        });
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
        myAdminTransactions,
        myAdminVolume,
        userRole,
      };
    } catch (error) {
      console.error('❌ Erreur getDashboardStats:', error);
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
    };
  }

  // ============================================================
  // STATISTIQUES DES COMMISSIONS
  // ============================================================
  async getCommissionStats(userId: string, userRole: string) {
    try {
      const commissionRate = 0.5;
      let totalCommission = 0;
      let commissionTransactions = 0;
      let recentCommissions = [];
      let myCommission = 0;
      let myCommissionTransactions = 0;

      const isValidId = Types.ObjectId.isValid(userId);

      if (userRole === 'super_admin') {
        const allAdminTx = await this.transactionModel
          .find({
            status: TransactionStatus.COMPLETED,
            'metadata.adminAction': true,
          })
          .sort({ createdAt: -1 })
          .populate('senderId', 'firstName lastName email language')
          .populate('receiverId', 'firstName lastName email language')
          .lean();

        commissionTransactions = allAdminTx.length;
        totalCommission = allAdminTx.reduce((sum, tx) => {
          return sum + (tx.amount * commissionRate / 100);
        }, 0);

        recentCommissions = allAdminTx.slice(0, 5).map((tx: any) => {
          return {
            id: tx._id.toString(),
            adminName: 'Admin',
            userName: tx.receiverId 
              ? `${(tx.receiverId as any)?.firstName || ''} ${(tx.receiverId as any)?.lastName || ''}`.trim() 
              : tx.senderId 
                ? `${(tx.senderId as any)?.firstName || ''} ${(tx.senderId as any)?.lastName || ''}`.trim()
                : 'Utilisateur',
            amount: tx.amount,
            commission: tx.amount * commissionRate / 100,
            createdAt: tx.createdAt,
            type: tx.type,
            language: (tx.receiverId as any)?.language || 'fr',
          };
        });

        if (isValidId) {
          const myAdminTx = await this.transactionModel
            .find({
              status: TransactionStatus.COMPLETED,
              'metadata.adminId': new Types.ObjectId(userId),
            })
            .lean();

          myCommissionTransactions = myAdminTx.length;
          myCommission = myAdminTx.reduce((sum, tx) => {
            return sum + (tx.amount * commissionRate / 100);
          }, 0);
        }

      } else if (userRole === 'admin' && isValidId) {
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
          return sum + (tx.amount * commissionRate / 100);
        }, 0);

        recentCommissions = myTx.slice(0, 5).map((tx: any) => ({
          id: tx._id.toString(),
          adminName: 'Moi',
          userName: tx.receiverId 
            ? `${(tx.receiverId as any)?.firstName || ''} ${(tx.receiverId as any)?.lastName || ''}`.trim() 
            : tx.senderId 
              ? `${(tx.senderId as any)?.firstName || ''} ${(tx.senderId as any)?.lastName || ''}`.trim()
              : 'Utilisateur',
          amount: tx.amount,
          commission: tx.amount * commissionRate / 100,
          createdAt: tx.createdAt,
          type: tx.type,
          language: (tx.receiverId as any)?.language || 'fr',
        }));

        totalCommission = myCommission;
        commissionTransactions = myCommissionTransactions;
      }

      return {
        totalCommission: Math.round(totalCommission * 100) / 100,
        commissionTransactions,
        commissionRate,
        recentCommissions,
        myCommission: Math.round(myCommission * 100) / 100,
        myCommissionTransactions,
        userRole,
      };
    } catch (error) {
      console.error('❌ Erreur getCommissionStats:', error);
      return {
        totalCommission: 0,
        commissionTransactions: 0,
        commissionRate: 0.5,
        recentCommissions: [],
        myCommission: 0,
        myCommissionTransactions: 0,
        userRole,
      };
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
    
    if (userId) {
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
  // ADMIN ACTIONS - DÉPÔT ET RETRAIT
  // ============================================================

  async depositMoney(
    adminId: string,
    userId: string,
    amount: number,
    description?: string,
    qrCode?: string,
  ) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('ID utilisateur invalide');
    }

    if (amount <= 0) {
      throw new BadRequestException('Le montant doit être supérieur à 0');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    if (qrCode) {
      const isValid = await this.validateQRCode(qrCode, 'deposit');
      if (!isValid) {
        throw new BadRequestException('QR Code invalide ou expiré');
      }
    }

    const commissionRate = 0.5;
    const commission = (amount * commissionRate) / 100;

    user.balance += amount;
    await user.save();

    const transaction = await this.transactionModel.create({
      senderId: null,
      receiverId: user._id,
      type: 'deposit',
      amount: amount,
      fee: 0,
      commission: commission,
      totalAmount: amount,
      status: TransactionStatus.COMPLETED,
      description: description || `Dépôt administrateur`,
      reference: `ADMIN-DEP-${Date.now()}`,
      paymentMethod: qrCode ? 'qr_code' : 'admin',
      metadata: {
        adminAction: true,
        adminId: new Types.ObjectId(adminId),
        qrCode: qrCode || null,
        commission: commission,
        commissionRate: commissionRate,
      },
    });

    await this.logModel.create({
      level: 'info',
      message: `Dépôt de ${amount} Ar effectué sur le compte de ${user.email} par admin ${adminId} (commission: ${commission} Ar)`,
      userId: userId,
      date: new Date(),
      metadata: { amount, description, qrCode, adminId, commission },
    });

    const userLang = (user.language || 'fr') as Language;

    const depositMessage = this.i18nService.translate(
      userLang,
      'deposit.success',
      { amount }
    );
    const commissionMessage = this.i18nService.translate(
      userLang,
      'deposit.commission',
      { amount: commission }
    );

    this.chatGateway?.notifyUser(userId, 'balanceUpdate', {
      newBalance: user.balance,
      amount,
      type: 'deposit',
      message: depositMessage,
      commissionMessage: commissionMessage,
      title: this.i18nService.translate(userLang, 'notification.deposit'),
    });

    return {
      success: true,
      message: `${depositMessage} (${commissionMessage})`,
      newBalance: user.balance,
      commission: commission,
      transaction: this.toTransactionResponse(transaction),
    };
  }

  async withdrawMoney(
    adminId: string,
    userId: string,
    amount: number,
    description?: string,
    qrCode?: string,
  ) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('ID utilisateur invalide');
    }

    if (amount <= 0) {
      throw new BadRequestException('Le montant doit être supérieur à 0');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    if (user.balance < amount) {
      const userLang = (user.language || 'fr') as Language;
      throw new BadRequestException(
        this.i18nService.translate(userLang, 'error.insufficient_balance')
      );
    }

    if (qrCode) {
      const isValid = await this.validateQRCode(qrCode, 'withdraw');
      if (!isValid) {
        throw new BadRequestException('QR Code invalide ou expiré');
      }
    }

    const commissionRate = 0.5;
    const commission = (amount * commissionRate) / 100;

    user.balance -= amount;
    await user.save();

    const transaction = await this.transactionModel.create({
      senderId: user._id,
      receiverId: null,
      type: 'withdrawal',
      amount: amount,
      fee: 0,
      commission: commission,
      totalAmount: amount,
      status: TransactionStatus.COMPLETED,
      description: description || `Retrait administrateur`,
      reference: `ADMIN-WTH-${Date.now()}`,
      paymentMethod: qrCode ? 'qr_code' : 'admin',
      metadata: {
        adminAction: true,
        adminId: new Types.ObjectId(adminId),
        qrCode: qrCode || null,
        commission: commission,
        commissionRate: commissionRate,
      },
    });

    await this.logModel.create({
      level: 'info',
      message: `Retrait de ${amount} Ar effectué sur le compte de ${user.email} par admin ${adminId} (commission: ${commission} Ar)`,
      userId: userId,
      date: new Date(),
      metadata: { amount, description, qrCode, adminId, commission },
    });

    const userLang = (user.language || 'fr') as Language;

    const withdrawalMessage = this.i18nService.translate(
      userLang,
      'withdrawal.success',
      { amount }
    );
    const commissionMessage = this.i18nService.translate(
      userLang,
      'withdrawal.commission',
      { amount: commission }
    );

    this.chatGateway?.notifyUser(userId, 'balanceUpdate', {
      newBalance: user.balance,
      amount,
      type: 'withdrawal',
      message: withdrawalMessage,
      commissionMessage: commissionMessage,
      title: this.i18nService.translate(userLang, 'notification.withdrawal'),
    });

    return {
      success: true,
      message: `${withdrawalMessage} (${commissionMessage})`,
      newBalance: user.balance,
      commission: commission,
      transaction: this.toTransactionResponse(transaction),
    };
  }

  // ============================================================
  // QR CODE
  // ============================================================

  async generateQRCode(adminId: string, type: 'deposit' | 'withdraw', amount?: number) {
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
        .update(`${parsed.adminId}-${parsed.action}-${parsed.amount || ''}-${new Date(parsed.timestamp).getTime()}`)
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
      role: adminData.role || 'admin',
      isActive: true,
      isGoogleUser: false,
      createdAt: new Date(),
      language: 'fr',
    });

    await newAdmin.save();

    await this.logModel.create({
      level: 'info',
      message: `Nouvel administrateur créé : ${adminData.email} (${
        adminData.role || 'admin'
      })`,
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
        $or: [{ role: 'admin' }, { role: 'super_admin' }],
      })
      .select('-password')
      .sort({ createdAt: -1 });

    return admins.map((u) => this.toUserResponse(u));
  }

  async deleteAdmin(adminId: string, currentAdminId: string) {
    if (adminId === currentAdminId) {
      throw new BadRequestException(
        'Vous ne pouvez pas vous supprimer vous-même',
      );
    }

    if (!Types.ObjectId.isValid(adminId)) {
      throw new NotFoundException('ID invalide');
    }

    const admin = await this.userModel.findById(adminId);
    if (!admin) {
      throw new NotFoundException('Administrateur non trouvé');
    }

    if (admin.role !== 'admin' && admin.role !== 'super_admin') {
      throw new BadRequestException(
        "Cet utilisateur n'est pas un administrateur",
      );
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
  // ⭐ PARAMÈTRES SYSTÈME (ADMIN ET SUPER ADMIN)
  // ============================================================

  // src/admin/admin.service.ts
// Partie corrigée des méthodes getSettings et updateSettings

// ============================================================
// ⭐ PARAMÈTRES SYSTÈME (ADMIN ET SUPER ADMIN)
// ============================================================

async getSettings(user?: any) {
  try {
    let settings = await this.settingModel.findOne();
    if (!settings) {
      // Créer les paramètres par défaut
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
          apiKeys: {},
          secrets: {},
          smtpPassword: '',
          jwtSecret: '',
          encryptionKey: '',
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
      });
    }

    // ✅ Convertir en objet pour manipulation
    const settingsObj = settings.toObject ? settings.toObject() : settings;

    // ⭐ Si c'est un admin (pas super_admin), masquer les données sensibles
    if (user && user.role === 'admin') {
      const sanitized = { ...settingsObj };
      
      // Supprimer les propriétés sensibles
      const sensitiveFields = ['apiKeys', 'secrets', 'smtpPassword', 'jwtSecret', 'encryptionKey'];
      for (const field of sensitiveFields) {
        if (sanitized.securityAdvanced && field in sanitized.securityAdvanced) {
          delete sanitized.securityAdvanced[field];
        }
      }
      
      // Masquer les paramètres de sécurité avancée si présents
      if (sanitized.securityAdvanced) {
        // Garder seulement rateLimit
        const { rateLimit, ...rest } = sanitized.securityAdvanced;
        sanitized.securityAdvanced = { rateLimit };
      }
      
      return sanitized;
    }

    return settingsObj;
  } catch (error) {
    console.error('❌ Erreur getSettings:', error);
    // Retourner les valeurs par défaut en cas d'erreur
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
    },
  };
}

async updateSettings(settingsData: any, user?: any) {
  try {
    // ✅ Vérifier que settingsData est un objet valide
    if (!settingsData || typeof settingsData !== 'object') {
      throw new BadRequestException('Données de paramètres invalides');
    }

    // ⭐ Si c'est un admin (pas super_admin), limiter les modifications
    if (user && user.role === 'admin') {
      // Les admins ne peuvent pas modifier les paramètres sensibles
      const sensitiveFields = ['apiKeys', 'secrets', 'smtpPassword', 'jwtSecret', 'encryptionKey'];
      for (const field of sensitiveFields) {
        if (settingsData.securityAdvanced && field in settingsData.securityAdvanced) {
          delete settingsData.securityAdvanced[field];
        }
      }
      
      // Les admins ne peuvent modifier que certains champs de sécurité
      if (settingsData.security) {
        const allowedSecurityFields = [
          'twoFactorAuth', 
          'requireEmailVerification', 
          'requirePhoneVerification'
        ];
        const filteredSecurity: any = {};
        for (const field of allowedSecurityFields) {
          if (settingsData.security[field] !== undefined) {
            filteredSecurity[field] = settingsData.security[field];
          }
        }
        settingsData.security = filteredSecurity;
      }
      
      // Les admins ne peuvent pas modifier la sécurité avancée
      if (settingsData.securityAdvanced) {
        // Garder seulement rateLimit
        if (settingsData.securityAdvanced.rateLimit) {
          settingsData.securityAdvanced = { 
            rateLimit: settingsData.securityAdvanced.rateLimit 
          };
        } else {
          delete settingsData.securityAdvanced;
        }
      }
    }

    // ✅ Mettre à jour les paramètres
    let settings = await this.settingModel.findOne();
    if (!settings) {
      // Créer avec les valeurs par défaut + les nouvelles
      const defaultSettings = this.getDefaultSettings();
      settings = await this.settingModel.create({
        ...defaultSettings,
        ...settingsData,
      });
    } else {
      // Mettre à jour les champs existants
      Object.assign(settings, settingsData);
      await settings.save();
    }

    // ✅ Log de l'action
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
    console.error('❌ Erreur updateSettings:', error);
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
      console.error('❌ Erreur getSystemLogs:', error);
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
        const estimatedSize = Math.round(
          (totalUsers * 500 + totalTransactions * 200) / 1024 / 1024,
        );
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
      console.error('❌ Erreur getSystemStats:', error);
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
      // Compter les logs d'API pour estimer le nombre d'appels
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
      const end = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        23,
        59,
        59,
      );

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