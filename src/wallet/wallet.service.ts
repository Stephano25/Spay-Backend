import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class WalletService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async getWallet(userId: string) {
    const user = await this.userModel.findById(userId).select('balance');
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    return { balance: user.balance };
  }

  async generateReceiveQRCode(userId: string, amount?: number) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    const qrData = {
      type: 'payment_request',
      receiverId: userId,
      receiverName: `${user.firstName} ${user.lastName}`,
      amount: amount || null,
      qrCode: user.qrCode,
      timestamp: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
    };

    return {
      qrCode: user.qrCode,
      data: qrData,
      expiresAt: qrData.expiresAt
    };
  }

  async scanQRCode(userId: string, qrData: string) {
    let parsedData;
    try {
      parsedData = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
    } catch {
      throw new BadRequestException('QR code invalide');
    }

    const receiverId = parsedData.receiverId;
    const amount = parsedData.amount;

    if (parsedData.expiresAt && new Date(parsedData.expiresAt) < new Date()) {
      throw new BadRequestException('Ce QR code a expiré');
    }

    const receiver = await this.userModel.findById(receiverId);
    if (!receiver) {
      throw new NotFoundException('Destinataire non trouvé');
    }

    return {
      isFriend: true, // Simplifié pour le test
      receiver: {
        id: receiver._id,
        firstName: receiver.firstName,
        lastName: receiver.lastName,
        email: receiver.email,
        profilePicture: receiver.profilePicture
      },
      amount: amount,
      requiresFriendRequest: false
    };
  }

  async sendMoney(userId: string, receiverId: string, amount: number) {
    if (userId === receiverId) {
      throw new BadRequestException('Vous ne pouvez pas envoyer d\'argent à vous-même');
    }

    if (amount <= 0) {
      throw new BadRequestException('Le montant doit être supérieur à 0');
    }

    const sender = await this.userModel.findById(userId);
    const receiver = await this.userModel.findById(receiverId);

    if (!sender || !receiver) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    if (sender.balance < amount) {
      throw new BadRequestException('Solde insuffisant');
    }

    sender.balance -= amount;
    receiver.balance += amount;

    await sender.save();
    await receiver.save();

    return {
      success: true,
      message: 'Transfert effectué avec succès',
      newBalance: sender.balance,
      amount: amount,
      receiver: {
        id: receiver._id,
        firstName: receiver.firstName,
        lastName: receiver.lastName
      }
    };
  }
}