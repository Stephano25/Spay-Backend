import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { User, UserDocument } from './schemas/user.schema';

const DEFAULT_SETTINGS = {
  general: { autoplayVideos: true, nsfwFilter: true },
  notifications: {
    email: true,
    push: true,
    sms: false,
    friendRequests: true,
    comments: true,
    likes: true,
    messages: true,
    mentions: true,
    groupActivities: true,
    dailyDigest: 'never',
  },
  privacy: {
    profileVisibility: 'public',
    postVisibility: 'public',
    showLastSeen: true,
    showOnlineStatus: true,
    allowFriendRequests: true,
    allowMessagesFromNonFriends: true,
  },
  security: { twoFactorAuth: false, sessionTimeout: 60, loginAlerts: true },
  appearance: { theme: 'system', fontSize: 'medium', language: 'fr', compactMode: false },
};

const PROTECTED_FIELDS = ['password', 'role', 'balance', 'isActive', 'email', 'qrCode', '_id', 'id', 'createdAt', 'updatedAt'];

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async findAll(): Promise<any[]> {
    const users = await this.userModel.find().select('-password').exec();
    return users.map((u) => this.toResponse(u));
  }

  async findById(userId: string): Promise<any> {
    const user = await this.userModel.findById(userId).select('-password');
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    return this.toResponse(user);
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).exec();
  }

  async findByQRCode(qrCode: string): Promise<any> {
    const user = await this.userModel.findOne({ qrCode }).select('-password');
    if (!user) {
      throw new NotFoundException('Aucun utilisateur ne correspond à ce QR code');
    }
    return this.toResponse(user);
  }

  async create(userData: Partial<User>): Promise<UserDocument> {
    const newUser = new this.userModel(userData);
    return newUser.save();
  }

  async update(userId: string, updateData: any): Promise<any> {
    const sanitized = { ...updateData };
    for (const field of PROTECTED_FIELDS) {
      delete sanitized[field];
    }

    const user = await this.userModel.findByIdAndUpdate(userId, sanitized, {
      new: true,
      runValidators: true,
    }).select('-password');

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    return this.toResponse(user);
  }

  async delete(userId: string): Promise<void> {
    const result = await this.userModel.deleteOne({ _id: userId }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
  }

  async search(query: string): Promise<any[]> {
    const regex = new RegExp(query, 'i');
    const users = await this.userModel
      .find({
        isActive: true,
        $or: [
          { firstName: regex },
          { lastName: regex },
          { email: regex },
          { phoneNumber: regex },
        ],
      })
      .select('firstName lastName email phoneNumber profilePicture')
      .limit(20);

    return users.map((u) => ({
      id: u._id.toString(),
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      phoneNumber: u.phoneNumber,
      profilePicture: u.profilePicture,
    }));
  }

  async updateBalance(userId: string, amount: number): Promise<any> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    user.balance += amount;
    await user.save();
    return this.toResponse(user);
  }

  async getUserSettings(userId: string): Promise<any> {
    const user = await this.userModel.findById(userId).select('settings');
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    if (!user.settings || Object.keys(user.settings).length === 0) {
      return DEFAULT_SETTINGS;
    }
    return {
      general: { ...DEFAULT_SETTINGS.general, ...(user.settings.general || {}) },
      notifications: { ...DEFAULT_SETTINGS.notifications, ...(user.settings.notifications || {}) },
      privacy: { ...DEFAULT_SETTINGS.privacy, ...(user.settings.privacy || {}) },
      security: { ...DEFAULT_SETTINGS.security, ...(user.settings.security || {}) },
      appearance: { ...DEFAULT_SETTINGS.appearance, ...(user.settings.appearance || {}) },
    };
  }

  async updateUserSettings(userId: string, settings: any): Promise<any> {
    const current = await this.getUserSettings(userId);
    const merged = { ...current, ...settings };

    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { settings: merged },
      { new: true },
    );
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    return merged;
  }

  async updateProfilePicture(userId: string, url: string): Promise<any> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    this.tryDeleteLocalFile(user.profilePicture);
    user.profilePicture = url;
    await user.save();
    return this.toResponse(user);
  }

  async deleteProfilePicture(userId: string): Promise<any> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    this.tryDeleteLocalFile(user.profilePicture);
    user.profilePicture = null;
    await user.save();
    return this.toResponse(user);
  }

  private tryDeleteLocalFile(url?: string | null): void {
    if (!url || typeof url !== 'string') return;
    if (!url.startsWith('/uploads/')) return;
    try {
      const filePath = path.join(process.cwd(), url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Non bloquant
    }
  }

  private toResponse(user: UserDocument): any {
    return {
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      profilePicture: user.profilePicture,
      balance: user.balance,
      qrCode: user.qrCode,
      friends: user.friends || [],
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      bio: user.bio,
    };
  }
}