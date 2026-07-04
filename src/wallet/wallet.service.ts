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
  TransactionType,
  TransactionStatus,
} from '../transactions/schemas/transaction.schema';

@Injectable()
export class WalletService {
  constructor(
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Transaction.name) private txModel: Model<TransactionDocument>,
  ) {}

  async getWallet(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Utilisateur non trouvé');

    let wallet = await this.walletModel.findOne({ userId: new Types.ObjectId(userId) });

    if (!wallet) {
      wallet = new this.walletModel({
        userId: new Types.ObjectId(userId),
        balance: user.balance,
        currency: 'Ar',
        qrCode: user.qrCode,
        dailyLimit: 5000000,
        monthlyLimit: 50000000,
        isActive: true,
      });
      await wallet.save();
    } else {
      wallet.balance = user.balance;
      wallet.qrCode = user.qrCode;
      await wallet.save();
    }

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
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
      ...stats,
    };
  }

  async getBalance(userId: string) {
    const user = await this.userModel.findById(userId).select('balance');
    if (!user) throw new NotFoundException('Utilisateur non trouvé');
    return { balance: user.balance, currency: 'Ar' };
  }

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
      type: TransactionType.TRANSFER,
      amount,
      fee: 0,
      totalAmount: amount,
      status: TransactionStatus.COMPLETED,
      description: description || `Transfert vers ${receiver.firstName} ${receiver.lastName}`,
      reference,
      paymentMethod: 'wallet',
    });

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

  async deposit(userId: string, amount: number, paymentMethod: string) {
    if (amount <= 0) throw new BadRequestException('Montant invalide');

    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Utilisateur non trouvé');

    user.balance += amount;
    await user.save();

    const reference = `DEP-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    await this.txModel.create({
      senderId: new Types.ObjectId(userId),
      type: TransactionType.DEPOSIT,
      amount,
      fee: 0,
      totalAmount: amount,
      status: TransactionStatus.COMPLETED,
      description: `Dépôt via ${paymentMethod}`,
      reference,
      paymentMethod,
    });

    return { success: true, message: 'Dépôt effectué', newBalance: user.balance, amount };
  }

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
      type: TransactionType.WITHDRAWAL,
      amount,
      fee: 0,
      totalAmount: amount,
      status: TransactionStatus.COMPLETED,
      description: `Retrait via ${paymentMethod}`,
      reference,
      paymentMethod,
    });

    return { success: true, message: 'Retrait effectué', newBalance: user.balance, amount };
  }

  async syncWallet(userId: string) {
    const user = await this.userModel.findById(userId).select('balance qrCode');
    if (!user) throw new NotFoundException('Utilisateur non trouvé');

    await this.walletModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      { balance: user.balance, qrCode: user.qrCode },
      { upsert: true, new: true },
    );

    return { success: true, balance: user.balance, message: 'Synchronisation effectuée' };
  }

  private async computeStats(userId: string, wallet: WalletDocument) {
    const uid = new Types.ObjectId(userId);

    const txAgg = await this.txModel.aggregate([
      { $match: { $or: [{ senderId: uid }, { receiverId: uid }], status: 'completed' } },
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
      todaySpent: wallet.todaySpent,
      monthSpent: wallet.monthSpent,
      remainingDailyLimit: wallet.dailyLimit - wallet.todaySpent,
      remainingMonthlyLimit: wallet.monthlyLimit - wallet.monthSpent,
      recentTransactions,
    };
  }
}