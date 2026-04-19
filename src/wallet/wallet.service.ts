import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Wallet, WalletDocument } from './schemas/wallet.schema';
import { Transaction, TransactionDocument, TransactionStatus, TransactionType } from '../transactions/schemas/transaction.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class WalletService {
  constructor(
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  /**
   * Créer ou récupérer un wallet pour un utilisateur
   */
  async getOrCreateWallet(userId: string): Promise<WalletDocument> {
    const userObjectId = new Types.ObjectId(userId);
    let wallet = await this.walletModel.findOne({ userId: userObjectId });
    
    if (!wallet) {
      const user = await this.userModel.findById(userObjectId);
      if (!user) {
        throw new NotFoundException('Utilisateur non trouvé');
      }

      wallet = await this.walletModel.create({
        userId: userObjectId,
        balance: 0,
        totalReceived: 0,
        totalSent: 0,
        totalFees: 0,
        pendingBalance: 0,
        currency: 'Ar',
        dailyLimit: 5000000,
        monthlyLimit: 50000000,
        todaySpent: 0,
        monthSpent: 0,
        isActive: true,
        settings: {
          autoSave: true,
          notificationThreshold: 10000
        }
      });
    }

    // Vérifier et réinitialiser les limites quotidiennes/mensuelles
    await this.checkAndResetLimits(wallet);
    
    return wallet;
  }

  /**
   * Vérifier et réinitialiser les limites quotidiennes et mensuelles
   */
  private async checkAndResetLimits(wallet: WalletDocument): Promise<void> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Réinitialiser la limite quotidienne
    if (!wallet.lastResetDate || wallet.lastResetDate < today) {
      wallet.todaySpent = 0;
      wallet.lastResetDate = now;
    }

    // Réinitialiser la limite mensuelle
    if (wallet.lastResetDate && wallet.lastResetDate < thisMonth) {
      wallet.monthSpent = 0;
    }

    await wallet.save();
  }

  /**
   * Vérifier les limites de transaction
   */
  private async checkLimits(wallet: WalletDocument, amount: number): Promise<void> {
    // Vérifier la limite quotidienne
    if (wallet.todaySpent + amount > wallet.dailyLimit) {
      throw new BadRequestException(`Limite quotidienne dépassée (${wallet.dailyLimit} Ar)`);
    }

    // Vérifier la limite mensuelle
    if (wallet.monthSpent + amount > wallet.monthlyLimit) {
      throw new BadRequestException(`Limite mensuelle dépassée (${wallet.monthlyLimit} Ar)`);
    }

    // Vérifier le solde
    if (wallet.balance < amount) {
      throw new BadRequestException(`Solde insuffisant. Solde actuel: ${wallet.balance} Ar`);
    }
  }

  /**
   * Transférer de l'argent entre deux utilisateurs
   */
  async transferMoney(
    senderId: string, 
    receiverId: string, 
    amount: number, 
    description?: string
  ): Promise<TransactionDocument> {
    if (senderId === receiverId) {
      throw new BadRequestException('Vous ne pouvez pas transférer à vous-même');
    }

    if (amount <= 0) {
      throw new BadRequestException('Le montant doit être supérieur à 0');
    }

    const senderObjectId = new Types.ObjectId(senderId);
    const receiverObjectId = new Types.ObjectId(receiverId);

    // Vérifier que le receveur existe
    const receiver = await this.userModel.findById(receiverObjectId);
    if (!receiver) {
      throw new NotFoundException('Utilisateur destinataire non trouvé');
    }

    // Récupérer les wallets
    const senderWallet = await this.getOrCreateWallet(senderId);
    const receiverWallet = await this.getOrCreateWallet(receiverId);

    // Vérifier les limites
    await this.checkLimits(senderWallet, amount);

    // Calculer les frais (0.5% pour les transferts externes, 0% pour internes)
    const isInternal = true; // À personnaliser selon votre logique
    const fee = isInternal ? 0 : amount * 0.005;
    const totalAmount = amount + fee;

    // Créer la transaction
    const transaction = await this.transactionModel.create({
      senderId: senderObjectId,
      receiverId: receiverObjectId,
      type: TransactionType.TRANSFER,
      amount: amount,
      fee: fee,
      totalAmount: totalAmount,
      status: TransactionStatus.COMPLETED,
      description: description || `Transfert à ${receiver.firstName} ${receiver.lastName}`,
      reference: `TRF-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      paymentMethod: 'wallet',
      createdAt: new Date()
    });

    // Mettre à jour les soldes
    senderWallet.balance -= totalAmount;
    senderWallet.totalSent += amount;
    senderWallet.totalFees += fee;
    senderWallet.todaySpent += totalAmount;
    senderWallet.monthSpent += totalAmount;

    receiverWallet.balance += amount;
    receiverWallet.totalReceived += amount;

    // Sauvegarder les wallets
    await senderWallet.save();
    await receiverWallet.save();

    // Retourner la transaction avec les détails
    return transaction.populate(['senderId', 'receiverId']);
  }

  /**
   * Déposer de l'argent dans un wallet
   */
  async deposit(userId: string, amount: number, paymentMethod: string): Promise<TransactionDocument> {
    if (amount <= 0) {
      throw new BadRequestException('Le montant doit être supérieur à 0');
    }

    const userObjectId = new Types.ObjectId(userId);
    const wallet = await this.getOrCreateWallet(userId);

    // Créer la transaction de dépôt
    const transaction = await this.transactionModel.create({
      receiverId: userObjectId,
      type: TransactionType.DEPOSIT,
      amount: amount,
      fee: 0,
      totalAmount: amount,
      status: TransactionStatus.COMPLETED,
      description: `Dépôt de ${amount} Ar via ${paymentMethod}`,
      reference: `DEP-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      paymentMethod: paymentMethod,
      createdAt: new Date()
    });

    // Mettre à jour le solde
    wallet.balance += amount;
    wallet.totalReceived += amount;
    await wallet.save();

    return transaction.populate('receiverId');
  }

  /**
   * Retirer de l'argent du wallet
   */
  async withdraw(userId: string, amount: number, paymentMethod: string): Promise<TransactionDocument> {
    if (amount <= 0) {
      throw new BadRequestException('Le montant doit être supérieur à 0');
    }

    const userObjectId = new Types.ObjectId(userId);
    const wallet = await this.getOrCreateWallet(userId);

    // Vérifier le solde
    if (wallet.balance < amount) {
      throw new BadRequestException(`Solde insuffisant. Solde actuel: ${wallet.balance} Ar`);
    }

    // Créer la transaction de retrait
    const transaction = await this.transactionModel.create({
      senderId: userObjectId,
      type: TransactionType.WITHDRAWAL,
      amount: amount,
      fee: 0,
      totalAmount: amount,
      status: TransactionStatus.COMPLETED,
      description: `Retrait de ${amount} Ar via ${paymentMethod}`,
      reference: `WTH-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      paymentMethod: paymentMethod,
      createdAt: new Date()
    });

    // Mettre à jour le solde
    wallet.balance -= amount;
    wallet.totalSent += amount;
    await wallet.save();

    return transaction.populate('senderId');
  }

  /**
   * Obtenir les statistiques du wallet
   */
  async getWalletStats(userId: string): Promise<any> {
    const wallet = await this.getOrCreateWallet(userId);
    const userObjectId = new Types.ObjectId(userId);

    // Récupérer les dernières transactions
    const recentTransactions = await this.transactionModel
      .find({
        $or: [
          { senderId: userObjectId },
          { receiverId: userObjectId }
        ]
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('senderId', 'firstName lastName email')
      .populate('receiverId', 'firstName lastName email');

    return {
      balance: wallet.balance,
      totalReceived: wallet.totalReceived,
      totalSent: wallet.totalSent,
      totalFees: wallet.totalFees,
      pendingBalance: wallet.pendingBalance,
      currency: wallet.currency,
      dailyLimit: wallet.dailyLimit,
      monthlyLimit: wallet.monthlyLimit,
      todaySpent: wallet.todaySpent,
      monthSpent: wallet.monthSpent,
      remainingDailyLimit: wallet.dailyLimit - wallet.todaySpent,
      remainingMonthlyLimit: wallet.monthlyLimit - wallet.monthSpent,
      recentTransactions: recentTransactions
    };
  }

  /**
   * Obtenir le solde simple
   */
  async getBalance(userId: string): Promise<{ balance: number; currency: string }> {
    const wallet = await this.getOrCreateWallet(userId);
    return {
      balance: wallet.balance,
      currency: wallet.currency
    };
  }

  /**
   * Synchroniser le wallet avec les transactions (correction des incohérences)
   */
  async syncWalletBalance(userId: string): Promise<WalletDocument> {
    const userObjectId = new Types.ObjectId(userId);
    const wallet = await this.getOrCreateWallet(userId);

    // Calculer le solde réel à partir des transactions
    const received = await this.transactionModel.aggregate([
      { 
        $match: { 
          receiverId: userObjectId, 
          status: TransactionStatus.COMPLETED,
          type: { $in: [TransactionType.DEPOSIT, TransactionType.TRANSFER] }
        } 
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const sent = await this.transactionModel.aggregate([
      { 
        $match: { 
          senderId: userObjectId, 
          status: TransactionStatus.COMPLETED,
          type: { $in: [TransactionType.WITHDRAWAL, TransactionType.TRANSFER] }
        } 
      },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    const totalReceived = received.length > 0 ? received[0].total : 0;
    const totalSent = sent.length > 0 ? sent[0].total : 0;
    const calculatedBalance = totalReceived - totalSent;

    // Corriger si nécessaire
    if (wallet.balance !== calculatedBalance) {
      wallet.balance = calculatedBalance;
      await wallet.save();
      console.log(`✅ Wallet synchronisé pour ${userId}: ${calculatedBalance} Ar`);
    }

    return wallet;
  }
}