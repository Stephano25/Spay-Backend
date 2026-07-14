// src/wallet/wallet.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { Wallet, WalletDocument } from './schemas/wallet.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  Transaction,
  TransactionDocument,
} from '../transactions/schemas/transaction.schema';

@Injectable()
export class WalletService {
  constructor(
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Transaction.name) private txModel: Model<TransactionDocument>,
  ) {}

  /**
   * Récupère ou crée un wallet pour l'utilisateur
   */
  private async getOrCreateWallet(userId: string): Promise<WalletDocument> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Utilisateur non trouvé');

    let wallet = await this.walletModel.findOne({ userId: new Types.ObjectId(userId) });

    if (!wallet) {
      wallet = new this.walletModel({
        userId: new Types.ObjectId(userId),
        balance: user.balance || 0,
        currency: 'Ar',
        qrCode: user.qrCode,
        dailyLimit: 5000000,
        monthlyLimit: 50000000,
        isActive: true,
        todaySpent: 0,
        monthSpent: 0,
      });
      await wallet.save();
      console.log(`✅ Wallet créé pour l'utilisateur ${userId}`);
    } else {
      // Synchroniser le solde
      wallet.balance = user.balance;
      wallet.qrCode = user.qrCode;
      await wallet.save();
    }

    return wallet;
  }

  /**
   * Récupère les informations du wallet
   */
  async getWallet(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Utilisateur non trouvé');

    const stats = await this.computeStats(userId, wallet);

    return {
      id: wallet._id.toString(),
      userId: userId,
      balance: user.balance,
      currency: wallet.currency,
      qrCode: user.qrCode,
      dailyLimit: wallet.dailyLimit,
      monthlyLimit: wallet.monthlyLimit,
      isActive: wallet.isActive,
      todaySpent: wallet.todaySpent || 0,
      monthSpent: wallet.monthSpent || 0,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
      ...stats,
    };
  }

  /**
   * Récupère uniquement le solde
   */
  async getBalance(userId: string) {
    const user = await this.userModel.findById(userId).select('balance');
    if (!user) throw new NotFoundException('Utilisateur non trouvé');
    return { balance: user.balance, currency: 'Ar' };
  }

  /**
   * Génère un QR code pour recevoir de l'argent
   */
  async generateReceiveQRCode(userId: string, amount?: number) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Utilisateur non trouvé');

    const qrData = {
      type: 'payment_request',
      receiverId: userId,
      receiverName: `${user.firstName} ${user.lastName}`,
      amount: amount ?? null,
      qrCode: user.qrCode,
      timestamp: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };

    return {
      qrCode: user.qrCode,
      data: qrData,
      expiresAt: qrData.expiresAt,
    };
  }

  /**
   * Scan un QR code
   */
  async scanQRCode(userId: string, qrData: string) {
    let parsed: any;
    try {
      parsed = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
    } catch {
      throw new BadRequestException('QR code invalide');
    }

    if (parsed.expiresAt && new Date(parsed.expiresAt) < new Date()) {
      throw new BadRequestException('Ce QR code a expiré');
    }

    const receiver = await this.userModel.findById(parsed.receiverId);
    if (!receiver) throw new NotFoundException('Destinataire non trouvé');

    return {
      isFriend: true,
      receiver: {
        id: receiver._id.toString(),
        firstName: receiver.firstName,
        lastName: receiver.lastName,
        email: receiver.email,
        profilePicture: receiver.profilePicture,
      },
      amount: parsed.amount,
      requiresFriendRequest: false,
    };
  }

  /**
   * Envoyer de l'argent à un autre utilisateur
   */
  async sendMoney(userId: string, receiverId: string, amount: number, description?: string) {
    if (userId === receiverId) {
      throw new BadRequestException("Vous ne pouvez pas vous envoyer d'argent à vous-même");
    }
    if (amount <= 0) {
      throw new BadRequestException('Le montant doit être supérieur à 0');
    }

    const sender = await this.userModel.findById(userId);
    const receiver = await this.userModel.findById(receiverId);
    if (!sender || !receiver) throw new NotFoundException('Utilisateur non trouvé');
    if (sender.balance < amount) throw new BadRequestException('Solde insuffisant');

    sender.balance -= amount;
    receiver.balance += amount;
    await sender.save();
    await receiver.save();

    const reference = `TXN-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    await this.txModel.create({
      senderId: new Types.ObjectId(userId),
      receiverId: new Types.ObjectId(receiverId),
      type: 'transfer',
      amount,
      fee: 0,
      totalAmount: amount,
      status: 'completed',
      description: description || `Transfert vers ${receiver.firstName} ${receiver.lastName}`,
      reference,
      paymentMethod: 'wallet',
    });

    // Mettre à jour le wallet
    const senderWallet = await this.walletModel.findOne({ userId: new Types.ObjectId(userId) });
    if (senderWallet) {
      senderWallet.balance = sender.balance;
      senderWallet.todaySpent = (senderWallet.todaySpent || 0) + amount;
      senderWallet.monthSpent = (senderWallet.monthSpent || 0) + amount;
      await senderWallet.save();
    }

    return {
      success: true,
      message: 'Transfert effectué avec succès',
      newBalance: sender.balance,
      amount,
      receiver: {
        id: receiver._id.toString(),
        firstName: receiver.firstName,
        lastName: receiver.lastName,
      },
    };
  }

  /**
   * Déposer de l'argent
   */
  async deposit(userId: string, amount: number, paymentMethod: string) {
    if (amount <= 0) throw new BadRequestException('Montant invalide');

    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Utilisateur non trouvé');

    user.balance += amount;
    await user.save();

    const reference = `DEP-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    await this.txModel.create({
      senderId: new Types.ObjectId(userId),
      type: 'deposit',
      amount,
      fee: 0,
      totalAmount: amount,
      status: 'completed',
      description: `Dépôt via ${paymentMethod}`,
      reference,
      paymentMethod,
    });

    // Mettre à jour le wallet
    const wallet = await this.walletModel.findOne({ userId: new Types.ObjectId(userId) });
    if (wallet) {
      wallet.balance = user.balance;
      await wallet.save();
    }

    return { success: true, message: 'Dépôt effectué', newBalance: user.balance, amount };
  }

  /**
   * Retirer de l'argent
   */
  async withdraw(userId: string, amount: number, paymentMethod: string) {
    if (amount <= 0) throw new BadRequestException('Montant invalide');

    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Utilisateur non trouvé');
    if (user.balance < amount) throw new BadRequestException('Solde insuffisant');

    user.balance -= amount;
    await user.save();

    const reference = `WTH-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    await this.txModel.create({
      senderId: new Types.ObjectId(userId),
      type: 'withdrawal',
      amount,
      fee: 0,
      totalAmount: amount,
      status: 'completed',
      description: `Retrait via ${paymentMethod}`,
      reference,
      paymentMethod,
    });

    // Mettre à jour le wallet
    const wallet = await this.walletModel.findOne({ userId: new Types.ObjectId(userId) });
    if (wallet) {
      wallet.balance = user.balance;
      await wallet.save();
    }

    return { success: true, message: 'Retrait effectué', newBalance: user.balance, amount };
  }

  /**
   * Synchroniser le wallet avec l'utilisateur
   */
  async syncWallet(userId: string) {
    const user = await this.userModel.findById(userId).select('balance qrCode');
    if (!user) throw new NotFoundException('Utilisateur non trouvé');

    const wallet = await this.walletModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      { 
        balance: user.balance, 
        qrCode: user.qrCode,
        updatedAt: new Date()
      },
      { upsert: true, new: true },
    );

    return { 
      success: true, 
      balance: user.balance, 
      wallet: {
        id: wallet._id.toString(),
        dailyLimit: wallet.dailyLimit,
        monthlyLimit: wallet.monthlyLimit,
        todaySpent: wallet.todaySpent || 0,
        monthSpent: wallet.monthSpent || 0,
      },
      message: 'Synchronisation effectuée' 
    };
  }

  /**
   * Calcule les statistiques du wallet
   */
  private async computeStats(userId: string, wallet: WalletDocument) {
    const uid = new Types.ObjectId(userId);

    const txAgg = await this.txModel.aggregate([
      { 
        $match: { 
          $or: [{ senderId: uid }, { receiverId: uid }], 
          status: 'completed' 
        } 
      },
      {
        $group: {
          _id: null,
          totalSent: {
            $sum: {
              $cond: [{ $eq: ['$senderId', uid] }, '$amount', 0],
            },
          },
          totalReceived: {
            $sum: {
              $cond: [{ $eq: ['$receiverId', uid] }, '$amount', 0],
            },
          },
          totalFees: { $sum: '$fee' },
          count: { $sum: 1 },
        },
      },
    ]);

    const agg = txAgg[0] ?? { totalSent: 0, totalReceived: 0, totalFees: 0, count: 0 };

    const recentTransactions = await this.txModel
      .find({ $or: [{ senderId: uid }, { receiverId: uid }] })
      .populate('senderId', 'firstName lastName email')
      .populate('receiverId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return {
      totalSent: agg.totalSent,
      totalReceived: agg.totalReceived,
      totalTransactions: agg.count,
      totalFees: agg.totalFees,
      pendingBalance: 0,
      todaySpent: wallet.todaySpent || 0,
      monthSpent: wallet.monthSpent || 0,
      remainingDailyLimit: wallet.dailyLimit - (wallet.todaySpent || 0),
      remainingMonthlyLimit: wallet.monthlyLimit - (wallet.monthSpent || 0),
      recentTransactions: recentTransactions.map((t) => ({
        id: t._id.toString(),
        type: t.type,
        amount: t.amount,
        status: t.status,
        description: t.description,
        createdAt: t.createdAt,
        sender: t.senderId ? {
          id: (t.senderId as any)._id.toString(),
          firstName: (t.senderId as any).firstName,
          lastName: (t.senderId as any).lastName,
          email: (t.senderId as any).email,
        } : null,
        receiver: t.receiverId ? {
          id: (t.receiverId as any)._id.toString(),
          firstName: (t.receiverId as any).firstName,
          lastName: (t.receiverId as any).lastName,
          email: (t.receiverId as any).email,
        } : null,
      })),
    };
  }
}