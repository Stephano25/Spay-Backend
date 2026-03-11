import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Wallet, WalletDocument } from './schemas/wallet.schema';
import { Transaction, TransactionDocument } from '../transactions/schemas/transaction.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class WalletService {
  constructor(
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async getWalletByUserId(userId: string) {
    const userObjectId = new Types.ObjectId(userId);
    let wallet = await this.walletModel.findOne({ userId: userObjectId });
    
    if (!wallet) {
      // Créer un wallet si l'utilisateur n'en a pas
      wallet = await this.walletModel.create({
        userId: userObjectId,
        balance: 0,
        currency: 'Ar',
        dailyLimit: 5000000,
        monthlyLimit: 50000000,
        isActive: true
      });
    }
    
    return wallet;
  }

  async getWalletStats(userId: string) {
    const wallet = await this.getWalletByUserId(userId);
    const userObjectId = new Types.ObjectId(userId);
    
    const transactions = await this.transactionModel
      .find({
        $or: [
          { senderId: userObjectId },
          { receiverId: userObjectId }
        ]
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('senderId', 'firstName lastName email')
      .populate('receiverId', 'firstName lastName email')
      .exec();

    const totalDeposits = await this.transactionModel.aggregate([
      { $match: { receiverId: userObjectId, type: 'deposit', status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const totalWithdrawals = await this.transactionModel.aggregate([
      { $match: { senderId: userObjectId, type: 'withdrawal', status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const totalTransfers = await this.transactionModel.aggregate([
      { $match: { senderId: userObjectId, type: 'transfer', status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    return {
      totalBalance: wallet.balance,
      totalTransactions: transactions.length,
      totalDeposits: totalDeposits[0]?.total || 0,
      totalWithdrawals: totalWithdrawals[0]?.total || 0,
      totalTransfers: totalTransfers[0]?.total || 0,
      recentTransactions: transactions
    };
  }

  async getBalance(userId: string) {
    const wallet = await this.getWalletByUserId(userId);
    return { balance: wallet.balance };
  }

  async sendMoney(userId: string, data: { receiverId: string; amount: number; description?: string }) {
    const senderWallet = await this.getWalletByUserId(userId);
    const receiverWallet = await this.getWalletByUserId(data.receiverId);

    if (senderWallet.balance < data.amount) {
      throw new BadRequestException('Solde insuffisant');
    }

    // Créer la transaction - utiliser les ObjectId directement
    const transaction = await this.transactionModel.create({
      senderId: new Types.ObjectId(userId),
      receiverId: new Types.ObjectId(data.receiverId),
      type: 'transfer',
      amount: data.amount,
      fee: 0,
      totalAmount: data.amount,
      status: 'completed',
      description: data.description || 'Transfert',
      paymentMethod: 'wallet'
    });

    // Mettre à jour les soldes
    senderWallet.balance -= data.amount;
    receiverWallet.balance += data.amount;
    
    await senderWallet.save();
    await receiverWallet.save();

    return transaction;
  }

  async deposit(userId: string, data: { amount: number; paymentMethod: string }) {
    const wallet = await this.getWalletByUserId(userId);

    const transaction = await this.transactionModel.create({
      receiverId: new Types.ObjectId(userId),
      type: 'deposit',
      amount: data.amount,
      fee: 0,
      totalAmount: data.amount,
      status: 'completed',
      description: 'Dépôt',
      paymentMethod: data.paymentMethod
    });

    wallet.balance += data.amount;
    await wallet.save();

    return transaction;
  }

  async withdraw(userId: string, data: { amount: number; paymentMethod: string }) {
    const wallet = await this.getWalletByUserId(userId);

    if (wallet.balance < data.amount) {
      throw new BadRequestException('Solde insuffisant');
    }

    const transaction = await this.transactionModel.create({
      senderId: new Types.ObjectId(userId),
      type: 'withdrawal',
      amount: data.amount,
      fee: 0,
      totalAmount: data.amount,
      status: 'completed',
      description: 'Retrait',
      paymentMethod: data.paymentMethod
    });

    wallet.balance -= data.amount;
    await wallet.save();

    return transaction;
  }

  async generateQRCode(userId: string, amount?: number) {
    // Générer un QR code unique
    const qrCode = `SPAYE-${userId}-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    
    // Mettre à jour le wallet avec le QR code
    await this.walletModel.updateOne(
      { userId: new Types.ObjectId(userId) },
      { qrCode }
    );

    return {
      qrCode,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
    };
  }
}