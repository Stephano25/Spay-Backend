import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Transaction, TransactionDocument, TransactionType, TransactionStatus } from './schemas/transaction.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Wallet, WalletDocument } from '../wallet/schemas/wallet.schema';
import { SendMoneyDto } from './dto/send-money.dto';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
  ) {}

  /**
   * Envoyer de l'argent à un autre utilisateur
   */
  async sendMoney(userId: string, sendMoneyDto: SendMoneyDto) {
    const { receiverId, amount, description } = sendMoneyDto;

    // Utiliser le wallet pour l'expéditeur
    const senderWallet = await this.walletModel.findOne({ userId });
    if (!senderWallet) {
      throw new NotFoundException('Portefeuille de l\'expéditeur non trouvé');
    }

    if (senderWallet.balance < amount) {
      throw new BadRequestException('Solde insuffisant');
    }

    // Utiliser le wallet pour le destinataire
    const receiverWallet = await this.walletModel.findOne({ userId: receiverId });
    if (!receiverWallet) {
      throw new NotFoundException('Portefeuille du destinataire non trouvé');
    }

    // Mettre à jour les wallets
    senderWallet.balance -= amount;
    receiverWallet.balance += amount;

    // Synchroniser avec les users (optionnel)
    await this.syncUserBalance(userId, senderWallet.balance);
    await this.syncUserBalance(receiverId, receiverWallet.balance);

    await senderWallet.save();
    await receiverWallet.save();

    // Créer la transaction
    const transaction = new this.transactionModel({
      senderId: userId,
      receiverId,
      amount,
      type: TransactionType.TRANSFER,
      description,
      status: TransactionStatus.COMPLETED,
    });

    await transaction.save();

    return transaction;
  }

  /**
   * Synchroniser le solde du wallet avec l'utilisateur
   */
  private async syncUserBalance(userId: string, balance: number) {
    const user = await this.userModel.findById(userId);
    if (user) {
      user.balance = balance;
      await user.save();
    }
  }

  /**
   * Récupérer les transactions d'un utilisateur
   */
  async getUserTransactions(userId: string) {
    return this.transactionModel.find({
      $or: [{ senderId: userId }, { receiverId: userId }],
    })
    .sort({ createdAt: -1 })
    .populate('senderId', 'firstName lastName email')
    .populate('receiverId', 'firstName lastName email')
    .exec();
  }

  /**
   * Récupérer les statistiques du dashboard
   */
  async getDashboardStats(userId: string) {
    const transactions = await this.transactionModel.find({
      $or: [{ senderId: userId }, { receiverId: userId }],
      status: TransactionStatus.COMPLETED,
    }).lean().exec();

    // Utiliser le wallet pour le solde
    const wallet = await this.walletModel.findOne({ userId });
    if (!wallet) {
      throw new NotFoundException('Portefeuille non trouvé');
    }

    const totalBalance = wallet.balance;
    const totalTransactions = transactions.length;
    
    const lastThreeTransactions = transactions.slice(0, 3);
    
    const lastDeposit = transactions
      .filter(t => t.type === TransactionType.DEPOSIT || (t.receiverId && t.receiverId.toString() === userId))
      .sort((a: any, b: any) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      })[0];

    const largestTransaction = transactions.length > 0 
      ? transactions.reduce((max, t) => t.amount > max.amount ? t : max, transactions[0])
      : null;

    const monthlyStats = this.calculateMonthlyStats(transactions, userId);

    return {
      totalBalance,
      totalTransactions,
      lastThreeTransactions,
      lastDeposit,
      largestTransaction,
      monthlyStats,
    };
  }

  /**
   * Calculer les statistiques mensuelles
   */
  private calculateMonthlyStats(transactions: any[], userId: string) {
    const months: Record<string, any> = {};

    transactions.forEach(transaction => {
      if (transaction.createdAt) {
        const date = new Date(transaction.createdAt);
        const monthYear = `${date.getMonth() + 1}/${date.getFullYear()}`;
        
        if (!months[monthYear]) {
          months[monthYear] = {
            month: monthYear,
            sent: 0,
            received: 0,
            total: 0,
          };
        }

        if (transaction.senderId && transaction.senderId.toString() === userId) {
          months[monthYear].sent += transaction.amount;
        }
        if (transaction.receiverId && transaction.receiverId.toString() === userId) {
          months[monthYear].received += transaction.amount;
        }
        months[monthYear].total += transaction.amount;
      }
    });

    return Object.values(months);
  }

  /**
   * Obtenir le pourcentage de frais par opérateur
   */
  private getFeePercentage(operator: string): number {
    switch(operator) {
      case 'airtel': return 0.5;
      case 'orange': return 0.5;
      case 'mvola': return 0.5;
      default: return 0;
    }
  }

  /**
   * Calculer les frais avec minimum
   */
  private calculateFee(amount: number, operator: string): number {
    const feePercentage = this.getFeePercentage(operator);
    let fee = (amount * feePercentage) / 100;
    
    // Frais minimum de 200 Ar
    const MINIMUM_FEE = 200;
    if (fee < MINIMUM_FEE) {
      fee = MINIMUM_FEE;
    }
    
    return Math.ceil(fee);
  }

  /**
   * Transfert vers Mobile Money
   */
  async mobileMoneyTransfer(userId: string, operator: string, phoneNumber: string, amount: number) {
    console.log('🔄 Traitement transfert mobile money:', { userId, operator, phoneNumber, amount });
  
    // 1. Récupérer le WALLET
    const wallet = await this.walletModel.findOne({ userId });
    if (!wallet) {
      throw new NotFoundException('Portefeuille non trouvé');
    }
  
    console.log('💰 Solde du wallet:', wallet.balance);
  
    // 2. Valider le montant
    if (amount < 100) {
      throw new BadRequestException('Montant minimum: 100 Ar');
    }
  
    if (amount > 100000000) {
      throw new BadRequestException('Montant maximum: 100 000 000 Ar');
    }
  
    // 3. Valider l'opérateur
    const validOperators = ['airtel', 'orange', 'mvola'];
    if (!validOperators.includes(operator)) {
      throw new BadRequestException('Opérateur invalide. Choisissez: airtel, orange, mvola');
    }
  
    // 4. Valider le numéro de téléphone
    const cleanPhoneNumber = phoneNumber.replace(/\s/g, '');
    const phoneRegex = /^[0-9]{9,10}$/;
    if (!phoneRegex.test(cleanPhoneNumber)) {
      throw new BadRequestException('Numéro de téléphone invalide (9-10 chiffres)');
    }
  
    // 5. Calculer les frais
    const fee = this.calculateFee(amount, operator);
    const totalAmount = amount + fee;
  
    console.log('💰 Calcul des frais:', { amount, fee, totalAmount, operator });
  
    // 6. Vérifier le solde du WALLET (avec frais inclus)
    if (wallet.balance < totalAmount) {
      throw new BadRequestException(
        `Solde insuffisant. Nécessaire: ${totalAmount} Ar (montant: ${amount} Ar + frais: ${fee} Ar)`
      );
    }
  
    // 7. Déduire le solde du WALLET
    wallet.balance -= totalAmount;
    await wallet.save();

    // 8. Synchroniser avec l'utilisateur
    await this.syncUserBalance(userId, wallet.balance);

    // 9. Créer la transaction
    const transaction = new this.transactionModel({
      senderId: userId,
      amount: amount,
      fee: fee,
      totalAmount: totalAmount,
      type: TransactionType.MOBILE_MONEY,
      status: TransactionStatus.COMPLETED,
      mobileMoneyOperator: operator,
      mobileMoneyNumber: cleanPhoneNumber,
      description: `Transfert vers ${operator} ${cleanPhoneNumber} (frais: ${fee} Ar)`,
      metadata: {
        operator: operator,
        phoneNumber: cleanPhoneNumber,
        fee: fee,
        originalAmount: amount
      }
    });

    await transaction.save();
  
    console.log('✅ Transfert mobile money réussi. Nouveau solde:', wallet.balance);
    
    return {
      ...transaction.toObject(),
      message: `Transfert de ${amount} Ar vers ${operator} réussi. Frais: ${fee} Ar`,
      newBalance: wallet.balance
    };
  }

  /**
   * Paiement par scan QR code
   */
  async scanAndPay(userId: string, receiverQrCode: string, amount: number) {
    const receiver = await this.userModel.findOne({ qrCode: receiverQrCode });
    
    if (!receiver) {
      throw new NotFoundException('Destinataire non trouvé');
    }

    return this.sendMoney(userId, {
      receiverId: receiver._id.toString(),
      amount,
      description: 'Paiement par scan',
    });
  }
}