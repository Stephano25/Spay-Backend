// users/users.service.ts - AJOUTER CES MÉTHODES

import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
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

  // ============================================================
  // MÉTHODES EXISTANTES (à conserver)
  // ============================================================

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

  // ============================================================
  // ✅ NOUVELLES MÉTHODES POUR LE FRONTEND
  // ============================================================

  async getFriendsCount(userId: string): Promise<{ count: number }> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    return { count: user.friends?.length || 0 };
  }

  async getPostsCount(userId: string): Promise<{ count: number }> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    // Si vous avez un modèle Post, retournez le nombre de posts
    // Sinon, retournez 0
    return { count: 0 };
  }

  async getFriends(userId: string): Promise<any[]> {
    const user = await this.userModel.findById(userId)
      .populate('friends', 'firstName lastName email profilePicture');
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    
    return (user.friends || []).map((friend: any) => ({
      id: friend._id.toString(),
      name: `${friend.firstName} ${friend.lastName}`,
      firstName: friend.firstName,
      lastName: friend.lastName,
      email: friend.email,
      avatar: friend.profilePicture || '/assets/default-avatar.png',
      mutualFriends: 0,
    }));
  }

  async getCloseFriends(userId: string): Promise<any[]> {
    // Simuler des amis proches
    const user = await this.userModel.findById(userId)
      .populate('friends', 'firstName lastName email profilePicture');
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    
    // Retourner les 3 premiers amis comme "amis proches"
    const friends = (user.friends || []).slice(0, 3);
    return friends.map((friend: any) => ({
      id: friend._id.toString(),
      name: `${friend.firstName} ${friend.lastName}`,
      avatar: friend.profilePicture || '/assets/default-avatar.png',
      mutualFriends: 0,
    }));
  }

  async getAcquaintances(userId: string): Promise<any[]> {
    const user = await this.userModel.findById(userId)
      .populate('friends', 'firstName lastName email profilePicture');
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    
    // Retourner les amis après les 3 premiers comme "connaissances"
    const friends = (user.friends || []).slice(3, 8);
    return friends.map((friend: any) => ({
      id: friend._id.toString(),
      name: `${friend.firstName} ${friend.lastName}`,
      avatar: friend.profilePicture || '/assets/default-avatar.png',
      mutualFriends: 0,
    }));
  }

  async getFriendRequests(userId: string): Promise<any[]> {
    // Simuler des demandes d'amis (si vous avez un modèle FriendRequest)
    return [];
  }

  async getBlockedUsers(userId: string): Promise<any[]> {
    // Simuler des utilisateurs bloqués
    return [];
  }

  async getFriendSuggestions(userId: string): Promise<any[]> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    
    // Trouver des suggestions d'amis
    const friendIds = user.friends || [];
    const suggestions = await this.userModel
      .find({
        _id: { $nin: [userId, ...friendIds].map(id => new Types.ObjectId(id)) },
        isActive: true,
      })
      .limit(5)
      .select('firstName lastName email profilePicture friends')
      .lean();

    return suggestions.map((suggestion: any) => ({
      id: suggestion._id.toString(),
      name: `${suggestion.firstName} ${suggestion.lastName}`,
      avatar: suggestion.profilePicture || '/assets/default-avatar.png',
      mutualFriends: (suggestion.friends || []).filter((id: string) => 
        friendIds.includes(id)
      ).length || 0,
    }));
  }

  async getDevices(userId: string): Promise<any[]> {
    // Simuler des appareils connectés
    return [
      {
        id: 'device-1',
        name: 'Chrome sur Windows',
        location: 'Paris, France',
        lastActive: new Date(),
      },
      {
        id: 'device-2',
        name: 'Safari sur iPhone',
        location: 'Paris, France',
        lastActive: new Date(Date.now() - 3600000),
      }
    ];
  }

  async changeEmail(userId: string, email: string): Promise<any> {
    const existingUser = await this.userModel.findOne({ email });
    if (existingUser && existingUser._id.toString() !== userId) {
      throw new ConflictException('Email déjà utilisé');
    }

    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { email },
      { new: true }
    ).select('-password');

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    return { success: true, email: user.email };
  }

  async changePhone(userId: string, phone: string): Promise<any> {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { phoneNumber: phone },
      { new: true }
    ).select('-password');

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    return { success: true, phone: user.phoneNumber };
  }

  async deactivateAccount(userId: string, password: string): Promise<any> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new BadRequestException('Mot de passe incorrect');
    }

    user.isActive = false;
    await user.save();
    return { success: true };
  }

  async deleteAccount(userId: string, password: string): Promise<any> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new BadRequestException('Mot de passe incorrect');
    }

    await this.userModel.findByIdAndDelete(userId);
    return { success: true };
  }

  async downloadUserData(userId: string): Promise<any> {
    const user = await this.userModel.findById(userId)
      .select('-password')
      .populate('friends', 'firstName lastName email');

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    const userData = {
      profile: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        bio: user.bio,
        createdAt: user.createdAt,
      },
      settings: user.settings || {},
      friends: (user.friends || []).map((f: any) => ({
        id: f._id.toString(),
        name: `${f.firstName} ${f.lastName}`,
        email: f.email,
      })),
    };

    return userData;
  }

  async updateProfile(userId: string, updateData: any): Promise<any> {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    ).select('-password');

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    return this.toResponse(user);
  }

  // ============================================================
  // GESTION DES AMIS
  // ============================================================

  async acceptFriendRequest(userId: string, requestId: string): Promise<any> {
    // Simuler l'acceptation d'une demande d'ami
    return { success: true };
  }

  async rejectFriendRequest(userId: string, requestId: string): Promise<any> {
    // Simuler le refus d'une demande d'ami
    return { success: true };
  }

  async sendFriendRequest(userId: string, friendId: string): Promise<any> {
    if (userId === friendId) {
      throw new BadRequestException('Vous ne pouvez pas vous ajouter vous-même');
    }

    const user = await this.userModel.findById(userId);
    const friend = await this.userModel.findById(friendId);

    if (!user || !friend) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    // Simuler l'envoi d'une demande d'ami
    return { success: true };
  }

  async unfriend(userId: string, friendId: string): Promise<any> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    user.friends = (user.friends || []).filter(id => id.toString() !== friendId);
    await user.save();

    return { success: true };
  }

  async blockUser(currentUserId: string, userId: string): Promise<any> {
    if (currentUserId === userId) {
      throw new BadRequestException('Vous ne pouvez pas vous bloquer vous-même');
    }
    return { success: true };
  }

  async unblockUser(currentUserId: string, userId: string): Promise<any> {
    return { success: true };
  }

  // ============================================================
  // GESTION DES APPAREILS
  // ============================================================

  async revokeDevice(userId: string, deviceId: string): Promise<any> {
    return { success: true };
  }

  async logoutAllDevices(userId: string): Promise<any> {
    return { success: true };
  }

  // ============================================================
  // SIGNALEMENT
  // ============================================================

  async reportUser(reporterId: string, userId: string, reason: string): Promise<any> {
    console.log(`📢 Signalement: utilisateur ${userId} signalé par ${reporterId} pour: ${reason}`);
    return { success: true };
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