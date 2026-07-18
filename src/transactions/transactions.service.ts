// backend/src/transactions/transactions.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import {
  Transaction,
  TransactionDocument,
  TransactionStatus,
  TransactionType,
} from './schemas/transaction.schema';
import { User, UserDocument, UserRole } from '../users/schemas/user.schema';
import { SendMoneyDto } from './dto/send-money.dto';

// ✅ Commission pour transfert utilisateur → utilisateur : 5%
const USER_TRANSFER_COMMISSION_RATE = 0.05;

@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(Transaction.name)
    private txModel: Model<TransactionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  // ============================================================
  // TRANSFERT UTILISATEUR → UTILISATEUR (5% commission Super Admin)
  // ============================================================
  async sendMoney(userId: string, dto: SendMoneyDto) {
    if (userId === dto.receiverId) {
      throw new BadRequestException(
        "Vous ne pouvez pas vous envoyer de l'argent à vous-même",
      );
    }

    const sender = await this.userModel.findById(userId);
    const receiver = await this.userModel.findById(dto.receiverId);

    if (!sender) throw new NotFoundException('Expéditeur non trouvé');
    if (!receiver) throw new NotFoundException('Destinataire non trouvé');
    if (!receiver.isActive)
      throw new BadRequestException('Le destinataire est inactif');

    // ✅ Récupérer le Super Admin
    const superAdmin = await this.userModel.findOne({ role: UserRole.SUPER_ADMIN });
    if (!superAdmin) {
      throw new NotFoundException('Super Administrateur non trouvé');
    }

    // ✅ Calcul de la commission (5%)
    const commission = dto.amount * USER_TRANSFER_COMMISSION_RATE;
    const totalDeducted = dto.amount + commission;

    if (sender.balance < totalDeducted) {
      throw new BadRequestException(
        `Solde insuffisant. ${totalDeducted} Ar requis dont ${commission} Ar de commission`,
      );
    }

    // ✅ Déduire le montant + commission du sender
    sender.balance -= totalDeducted;
    await sender.save();

    // ✅ Créditer le destinataire
    receiver.balance += dto.amount;
    await receiver.save();

    // ✅ Créditer le Super Admin
    superAdmin.balance += commission;
    await superAdmin.save();

    const reference = `TXN-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    // ✅ CRÉER LA TRANSACTION AVEC COMMISSION COMPLÈTE
    const tx = new this.txModel({
      senderId: new Types.ObjectId(userId),
      receiverId: new Types.ObjectId(dto.receiverId),
      type: TransactionType.TRANSFER,
      amount: dto.amount,
      fee: commission,
      commission: {
        total: commission,
        superAdminCommission: commission,
        adminCommission: 0,
        superAdminId: superAdmin._id,
        adminId: null,
        type: 'user_transfer',
        rate: 5,
        breakdown: `Super Admin: ${commission} Ar (5%)`,
      },
      totalAmount: totalDeducted,
      status: TransactionStatus.COMPLETED,
      description:
        dto.description || `Transfert vers ${receiver.firstName} ${receiver.lastName}`,
      reference,
      paymentMethod: 'wallet',
      // ✅ AJOUTER LES MÉTADATA POUR LA RECHERCHE
      metadata: {
        hasCommission: true,
        commissionAmount: commission,
        commissionRate: 5,
        commissionType: 'user_transfer',
      },
    });
    await tx.save();

    // ✅ LOG POUR VÉRIFIER
    console.log(`💰 Transaction créée avec commission: ${commission} Ar`);
    console.log(`📋 Transaction:`, JSON.stringify(tx.commission, null, 2));

    return this.toTransactionResponse(tx, userId);
  }

  // ============================================================
  // MOBILE MONEY
  // ============================================================
  async mobileMoneyTransfer(
    userId: string,
    operator: string,
    phoneNumber: string,
    amount: number,
  ) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Utilisateur non trouvé');

    if (amount < 100) throw new BadRequestException('Montant minimum: 100 Ar');
    if (amount > 100000000)
      throw new BadRequestException('Montant maximum: 100 000 000 Ar');

    const validOperators = ['airtel', 'orange', 'mvola'];
    if (!validOperators.includes(operator))
      throw new BadRequestException('Opérateur invalide');

    const cleanPhoneNumber = phoneNumber.replace(/\s/g, '');
    if (!/^[0-9]{9,10}$/.test(cleanPhoneNumber))
      throw new BadRequestException('Numéro invalide (9-10 chiffres)');

    const fee = this.calculateFee(amount, operator);
    const totalAmount = amount + fee;

    if (user.balance < totalAmount) {
      throw new BadRequestException(
        `Solde insuffisant. Nécessaire: ${totalAmount} Ar (dont frais ${fee} Ar)`,
      );
    }

    user.balance -= totalAmount;
    await user.save();

    const reference = `MM-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    const tx = new this.txModel({
      senderId: new Types.ObjectId(userId),
      type: TransactionType.MOBILE_MONEY,
      amount,
      fee,
      totalAmount,
      status: TransactionStatus.COMPLETED,
      description: `Transfert Mobile Money ${operator.toUpperCase()} → ${cleanPhoneNumber}`,
      reference,
      mobileMoneyOperator: operator,
      mobileMoneyNumber: cleanPhoneNumber,
      paymentMethod: 'mobile_money',
      metadata: { operator, phoneNumber: cleanPhoneNumber, fee, originalAmount: amount },
    });
    await tx.save();

    return {
      ...this.toTransactionResponse(tx, userId),
      message: `Transfert de ${amount} Ar vers ${operator} réussi. Frais: ${fee} Ar`,
      newBalance: user.balance,
    };
  }

  private calculateFee(amount: number, operator: string): number {
    const feePercentage = { airtel: 0.5, orange: 0.5, mvola: 0.5 }[operator] || 0.5;
    let fee = (amount * feePercentage) / 100;
    const MINIMUM_FEE = 200;
    return Math.ceil(fee < MINIMUM_FEE ? MINIMUM_FEE : fee);
  }

  // ============================================================
  // SCAN & PAY
  // ============================================================
  async scanAndPay(
    userId: string,
    receiverQrCode: string,
    amount: number,
    description?: string,
  ) {
    const receiver = await this.userModel.findOne({ qrCode: receiverQrCode });
    if (!receiver) {
      throw new NotFoundException('QR code invalide');
    }
    if (receiver._id.toString() === userId) {
      throw new BadRequestException('Impossible de vous payer vous-même');
    }

    const sender = await this.userModel.findById(userId);
    if (!sender) throw new NotFoundException('Expéditeur non trouvé');
    if (sender.balance < amount)
      throw new BadRequestException('Solde insuffisant');

    sender.balance -= amount;
    receiver.balance += amount;
    await sender.save();
    await receiver.save();

    const reference = `QR-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const tx = new this.txModel({
      senderId: new Types.ObjectId(userId),
      receiverId: receiver._id,
      type: TransactionType.PAYMENT,
      amount,
      fee: 0,
      totalAmount: amount,
      status: TransactionStatus.COMPLETED,
      description: description || `Paiement QR à ${receiver.firstName} ${receiver.lastName}`,
      reference,
      paymentMethod: 'wallet',
    });
    await tx.save();

    return this.toTransactionResponse(tx, userId);
  }

  // ============================================================
  // RÉCUPÉRATION DES TRANSACTIONS
  // ============================================================
  async getUserTransactions(userId: string) {
    const uid = new Types.ObjectId(userId);
    const txs = await this.txModel
      .find({ $or: [{ senderId: uid }, { receiverId: uid }] })
      .populate('senderId', 'firstName lastName email')
      .populate('receiverId', 'firstName lastName email')
      .sort({ createdAt: -1 });

    return txs.map((t) => this.toTransactionResponse(t, userId));
  }

  // ============================================================
  // STATISTIQUES TABLEAU DE BORD UTILISATEUR
  // ============================================================
  async getDashboardStats(userId: string) {
    const uid = new Types.ObjectId(userId);
    const user = await this.userModel.findById(uid).select('balance');
    if (!user) throw new NotFoundException('Utilisateur non trouvé');

    const allTx = await this.txModel
      .find({
        $or: [{ senderId: uid }, { receiverId: uid }],
        status: 'completed',
      })
      .populate('senderId', 'firstName lastName email')
      .populate('receiverId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(100);

    const lastThreeTransactions = allTx.slice(0, 3).map((t) =>
      this.toTransactionResponse(t, userId),
    );

    const lastDeposit = allTx.find((t) => t.type === 'deposit');
    const largestTransaction = [...allTx].sort((a, b) => b.amount - a.amount)[0];

    const monthlyStats = this.buildMonthlyStats(allTx, userId);

    return {
      totalBalance: user.balance,
      totalTransactions: allTx.length,
      lastThreeTransactions,
      lastDeposit: lastDeposit
        ? this.toTransactionResponse(lastDeposit, userId)
        : undefined,
      largestTransaction: largestTransaction
        ? this.toTransactionResponse(largestTransaction, userId)
        : undefined,
      monthlyStats,
    };
  }

  // ============================================================
  // HELPERS PRIVÉS
  // ============================================================
  private toTransactionResponse(tx: any, viewerUserId: string) {
    const senderObj = tx.senderId && typeof tx.senderId === 'object' && tx.senderId.email
      ? tx.senderId
      : null;
    const receiverObj = tx.receiverId && typeof tx.receiverId === 'object' && tx.receiverId.email
      ? tx.receiverId
      : null;

    return {
      id: tx._id.toString(),
      senderId: senderObj ? senderObj._id.toString() : tx.senderId?.toString(),
      receiverId: receiverObj ? receiverObj._id.toString() : tx.receiverId?.toString(),
      type: tx.type,
      amount: tx.amount,
      fee: tx.fee,
      commission: tx.commission || null,
      totalAmount: tx.totalAmount,
      status: tx.status,
      description: tx.description,
      reference: tx.reference,
      mobileMoneyOperator: tx.mobileMoneyOperator,
      mobileMoneyNumber: tx.mobileMoneyNumber,
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
      sender: senderObj
        ? {
            id: senderObj._id.toString(),
            firstName: senderObj.firstName,
            lastName: senderObj.lastName,
            email: senderObj.email,
          }
        : undefined,
      receiver: receiverObj
        ? {
            id: receiverObj._id.toString(),
            firstName: receiverObj.firstName,
            lastName: receiverObj.lastName,
            email: receiverObj.email,
          }
        : undefined,
    };
  }

  private buildMonthlyStats(txs: TransactionDocument[], userId: string) {
    const uid = userId.toString();
    const now = new Date();
    const months: { month: string; sent: number; received: number; total: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).getTime();

      const inMonth = txs.filter(
        (t) =>
          new Date(t.createdAt).getTime() >= monthStart &&
          new Date(t.createdAt).getTime() <= monthEnd,
      );

      const sent = inMonth
        .filter((t) => t.senderId?.toString() === uid && t.type !== 'deposit')
        .reduce((s, t) => s + t.amount, 0);

      const received = inMonth
        .filter(
          (t) =>
            t.receiverId?.toString() === uid || t.type === 'deposit',
        )
        .reduce((s, t) => s + t.amount, 0);

      months.push({ month: label, sent, received, total: sent + received });
    }
    return months;
  }
}