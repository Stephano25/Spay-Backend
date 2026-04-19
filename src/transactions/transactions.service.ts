import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Transaction, TransactionDocument, TransactionType, TransactionStatus } from './schemas/transaction.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { SendMoneyDto } from './dto/send-money.dto';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async sendMoney(userId: string, sendMoneyDto: SendMoneyDto) {
    const { receiverId, amount, description } = sendMoneyDto;

    const sender = await this.userModel.findById(userId);
    if (!sender) {
      throw new NotFoundException('Expéditeur non trouvé');
    }

    const receiver = await this.userModel.findById(receiverId);
    if (!receiver) {
      throw new NotFoundException('Destinataire non trouvé');
    }

    if (sender.balance < amount) {
      throw new BadRequestException('Solde insuffisant');
    }

    sender.balance -= amount;
    receiver.balance += amount;

    await sender.save();
    await receiver.save();

    const transaction = new this.transactionModel({
      senderId: userId,
      receiverId,
      amount,
      type: TransactionType.TRANSFER,
      description: description || `Transfert à ${receiver.firstName} ${receiver.lastName}`,
      status: TransactionStatus.COMPLETED,
    });

    await transaction.save();

    return transaction.populate('senderId receiverId');
  }

  async getUserTransactions(userId: string) {
    return this.transactionModel.find({
      $or: [{ senderId: userId }, { receiverId: userId }],
    })
    .sort({ createdAt: -1 })
    .populate('senderId', 'firstName lastName email')
    .populate('receiverId', 'firstName lastName email')
    .exec();
  }

  async getDashboardStats(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    const transactions = await this.transactionModel.find({
      $or: [{ senderId: userId }, { receiverId: userId }],
      status: TransactionStatus.COMPLETED,
    }).lean().exec();

    const totalBalance = user.balance;
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

  private getFeePercentage(operator: string): number {
    switch(operator) {
      case 'airtel': return 0.5;
      case 'orange': return 0.5;
      case 'mvola': return 0.5;
      default: return 0;
    }
  }

  private calculateFee(amount: number, operator: string): number {
    const feePercentage = this.getFeePercentage(operator);
    let fee = (amount * feePercentage) / 100;
    const MINIMUM_FEE = 200;
    if (fee < MINIMUM_FEE) {
      fee = MINIMUM_FEE;
    }
    return Math.ceil(fee);
  }

  async mobileMoneyTransfer(userId: string, operator: string, phoneNumber: string, amount: number) {
    console.log('🔄 Traitement transfert mobile money:', { userId, operator, phoneNumber, amount });
  
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
  
    if (amount < 100) {
      throw new BadRequestException('Montant minimum: 100 Ar');
    }
  
    if (amount > 100000000) {
      throw new BadRequestException('Montant maximum: 100 000 000 Ar');
    }
  
    const validOperators = ['airtel', 'orange', 'mvola'];
    if (!validOperators.includes(operator)) {
      throw new BadRequestException('Opérateur invalide');
    }
  
    const cleanPhoneNumber = phoneNumber.replace(/\s/g, '');
    const phoneRegex = /^[0-9]{9,10}$/;
    if (!phoneRegex.test(cleanPhoneNumber)) {
      throw new BadRequestException('Numéro de téléphone invalide');
    }
  
    const fee = this.calculateFee(amount, operator);
    const totalAmount = amount + fee;
  
    if (user.balance < totalAmount) {
      throw new BadRequestException(
        `Solde insuffisant. Nécessaire: ${totalAmount} Ar (montant: ${amount} Ar + frais: ${fee} Ar)`
      );
    }
  
    user.balance -= totalAmount;
    await user.save();

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
  
    return {
      ...transaction.toObject(),
      message: `Transfert de ${amount} Ar vers ${operator} réussi. Frais: ${fee} Ar`,
      newBalance: user.balance
    };
  }

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