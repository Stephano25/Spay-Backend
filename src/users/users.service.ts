import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.userModel.find().select('-password').exec();
  }

  async findById(id: string): Promise<User> {
    const user = await this.userModel.findById(id).select('-password').exec();
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email }).exec();
  }

  async findByQRCode(qrCode: string): Promise<User | null> {
    return this.userModel.findOne({ qrCode }).select('-password').exec();
  }

  async create(userData: Partial<User>): Promise<User> {
    const newUser = new this.userModel(userData);
    return newUser.save();
  }

  async update(id: string, userData: Partial<User>): Promise<User> {
    const user = await this.userModel
      .findByIdAndUpdate(id, userData, { new: true })
      .select('-password')
      .exec();
    
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    return user;
  }

  async delete(id: string): Promise<void> {
    const result = await this.userModel.deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
  }

  async search(query: string): Promise<User[]> {
    return this.userModel
      .find({
        $or: [
          { firstName: { $regex: query, $options: 'i' } },
          { lastName: { $regex: query, $options: 'i' } },
          { email: { $regex: query, $options: 'i' } },
          { phoneNumber: { $regex: query, $options: 'i' } },
        ],
      })
      .select('-password')
      .limit(10)
      .exec();
  }

  async updateBalance(userId: string, amount: number): Promise<User> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    user.balance += amount;
    await user.save();

    return user;
  }

  async getUserSettings(userId: string): Promise<any> {
    const user = await this.userModel.findById(userId).select('settings').exec();
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    // Retourner les settings ou des valeurs par défaut
    return (user as any).settings || {
      notifications: {
        email: true,
        push: true,
        sms: false,
        transactionAlerts: true,
        promoEmails: false
      },
      privacy: {
        profileVisibility: 'friends',
        showLastSeen: true,
        showOnlineStatus: true,
        allowFriendRequests: true
      },
      security: {
        twoFactorAuth: false,
        sessionTimeout: 30,
        loginAlerts: true
      },
      appearance: {
        theme: 'light',
        fontSize: 'medium',
        language: 'fr',
        compactMode: false
      }
    };
  }

  async updateUserSettings(userId: string, settings: any): Promise<any> {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { $set: { settings } },
      { new: true }
    ).exec();

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    return { success: true, settings: (user as any).settings };
  }
}