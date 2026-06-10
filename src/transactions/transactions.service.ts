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
    const receiver = await this.userModel.findById(receiverId);
    if (!sender || !receiver) throw new NotFoundException('Utilisateur non trouvé');
    if (sender.balance < amount) throw new BadRequestException('Solde insuffisant');
    sender.balance -= amount;
    receiver.balance += amount;
    await sender.save();
    await receiver.save();
    const transaction = new this.transactionModel({
      senderId: userId, receiverId, amount, type: TransactionType.TRANSFER,
      description: description || `Transfert à ${receiver.firstName} ${receiver.lastName}`,
      status: TransactionStatus.COMPLETED,
    });
    await transaction.save();
    return transaction.populate('senderId receiverId');
  }

  async mobileMoneyTransfer(userId: string, operator: string, phoneNumber: string, amount: number) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Utilisateur non trouvé');
    if (amount < 100) throw new BadRequestException('Montant minimum: 100 Ar');
    if (amount > 100000000) throw new BadRequestException('Montant maximum: 100 000 000 Ar');
    const validOperators = ['airtel', 'orange', 'mvola'];
    if (!validOperators.includes(operator)) throw new BadRequestException('Opérateur invalide');
    const cleanPhoneNumber = phoneNumber.replace(/\s/g, '');
    if (!/^[0-9]{9,10}$/.test(cleanPhoneNumber)) throw new BadRequestException('Numéro invalide');
    const fee = this.calculateFee(amount, operator);
    const totalAmount = amount + fee;
    if (user.balance < totalAmount) {
      throw new BadRequestException(`Solde insuffisant. Nécessaire: ${totalAmount} Ar (dont frais ${fee} Ar)`);
    }
    user.balance -= totalAmount;
    await user.save();
    const transaction = new this.transactionModel({
      senderId: userId, amount, fee, totalAmount, type: TransactionType.MOBILE_MONEY,
      status: TransactionStatus.COMPLETED, mobileMoneyOperator: operator, mobileMoneyNumber: cleanPhoneNumber,
      description: `Transfert vers ${operator} ${cleanPhoneNumber} (frais: ${fee} Ar)`,
      metadata: { operator, phoneNumber: cleanPhoneNumber, fee, originalAmount: amount }
    });
    await transaction.save();
    return { ...transaction.toObject(), message: `Transfert de ${amount} Ar vers ${operator} réussi. Frais: ${fee} Ar`, newBalance: user.balance };
  }

  private calculateFee(amount: number, operator: string): number {
    const feePercentage = { airtel: 0.5, orange: 0.5, mvola: 0.5 }[operator] || 0;
    let fee = (amount * feePercentage) / 100;
    const MINIMUM_FEE = 200;
    return Math.ceil(fee < MINIMUM_FEE ? MINIMUM_FEE : fee);
  }

  async getUserTransactions(userId: string) {
    return this.transactionModel.find({ $or: [{ senderId: userId }, { receiverId: userId }] }).sort({ createdAt: -1 }).populate('senderId receiverId').exec();
  }

  async getDashboardStats(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Utilisateur non trouvé');
    const transactions = await this.transactionModel.find({ $or: [{ senderId: userId }, { receiverId: userId }], status: TransactionStatus.COMPLETED }).lean().exec();
    const totalBalance = user.balance;
    const totalTransactions = transactions.length;
    const lastThreeTransactions = transactions.slice(0, 3);
    const largestTransaction = transactions.length ? transactions.reduce((max, t) => t.amount > max.amount ? t : max, transactions[0]) : null;
    return { totalBalance, totalTransactions, lastThreeTransactions, largestTransaction };
  }
}