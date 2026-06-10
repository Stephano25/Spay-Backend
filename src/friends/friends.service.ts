import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Friend, FriendDocument } from './schemas/friend.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { ConversationsService } from '../conversations/conversations.service';
import { ChatGateway } from '../chat/chat.gateway';

@Injectable()
export class FriendsService {
  constructor(
    @InjectModel(Friend.name) private friendModel: Model<FriendDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Inject(forwardRef(() => ConversationsService)) private conversationsService: ConversationsService,
    @Inject(forwardRef(() => ChatGateway)) private chatGateway: ChatGateway,
  ) {}

  async getFriends(userId: string): Promise<any[]> {
    const userObjectId = new Types.ObjectId(userId);
    const friendships = await this.friendModel.find({ $or: [{ userId: userObjectId }, { friendId: userObjectId }], status: 'accepted' })
      .populate('userId', 'firstName lastName email phoneNumber profilePicture isOnline lastSeen')
      .populate('friendId', 'firstName lastName email phoneNumber profilePicture isOnline lastSeen').exec();
    return friendships.map(f => ({ id: f._id, userId: f.userId._id, friendId: f.friendId._id, status: f.status, friend: f.userId._id.toString() === userId ? f.friendId : f.userId }));
  }

  async getFriendRequests(userId: string): Promise<any[]> {
    const requests = await this.friendModel.find({ friendId: new Types.ObjectId(userId), status: 'pending' }).populate('userId', 'firstName lastName email profilePicture').exec();
    return requests.map(r => ({ id: r._id, senderId: r.userId._id, receiverId: r.friendId._id, status: r.status, sender: r.userId }));
  }

  async sendFriendRequest(userId: string, friendId: string) {
    if (userId === friendId) throw new BadRequestException('Vous ne pouvez pas vous ajouter vous-même');
    const userObjectId = new Types.ObjectId(userId), friendObjectId = new Types.ObjectId(friendId);
    const friendExists = await this.userModel.findById(friendObjectId);
    if (!friendExists) throw new NotFoundException('Utilisateur non trouvé');
    let friendship = await this.friendModel.findOne({ $or: [{ userId: userObjectId, friendId: friendObjectId }, { userId: friendObjectId, friendId: userObjectId }] });
    if (friendship) {
      if (friendship.status === 'blocked') throw new ForbiddenException('Impossible d\'envoyer une demande à un utilisateur bloqué');
      if (friendship.status === 'pending') throw new BadRequestException('Une demande est déjà en attente');
      if (friendship.status === 'accepted') throw new BadRequestException('Vous êtes déjà amis');
      if (friendship.status === 'deleted') {
        friendship.status = 'pending';
        friendship.deletedBy = undefined;
        await friendship.save();
        this.chatGateway?.notifyUser(friendId, 'friendRequest', { from: userId, requestId: friendship._id });
        return { message: 'Demande d\'ami renvoyée', success: true, requestId: friendship._id };
      }
    } else {
      friendship = new this.friendModel({ userId: userObjectId, friendId: friendObjectId, status: 'pending' });
      await friendship.save();
    }
    this.chatGateway?.notifyUser(friendId, 'friendRequest', { from: userId, requestId: friendship._id });
    return { message: 'Demande d\'ami envoyée', success: true, requestId: friendship._id };
  }

  async acceptFriendRequest(userId: string, requestId: string) {
    const request = await this.friendModel.findById(requestId);
    if (!request) throw new NotFoundException('Demande non trouvée');
    if (request.friendId.toString() !== userId) throw new ForbiddenException('Non autorisé');
    if (request.status !== 'pending') throw new BadRequestException('Demande déjà traitée');
    request.status = 'accepted';
    await request.save();
    let conversation;
    try {
      conversation = await this.conversationsService.createConversation([request.userId.toString(), request.friendId.toString()]);
      if (conversation) await this.conversationsService.sendMessage(conversation._id.toString(), 'system', '👋 Vous êtes maintenant amis ! Commencez à discuter.', 'text');
    } catch (e) { console.error(e); }
    this.chatGateway?.notifyUser(request.userId.toString(), 'friendRequestAccepted', { by: userId, conversationId: conversation?._id });
    return { message: 'Demande d\'ami acceptée', conversationId: conversation?._id, success: true };
  }

  async declineFriendRequest(userId: string, requestId: string) {
    const request = await this.friendModel.findById(requestId);
    if (!request) throw new NotFoundException('Demande non trouvée');
    if (request.friendId.toString() !== userId) throw new ForbiddenException('Non autorisé');
    if (request.status !== 'pending') throw new BadRequestException('Demande déjà traitée');
    await request.deleteOne();
    this.chatGateway?.notifyUser(request.userId.toString(), 'friendRequestDeclined', { by: userId });
    return { message: 'Demande d\'ami refusée', success: true };
  }

  async removeFriend(userId: string, friendId: string) {
    const friendship = await this.friendModel.findOne({ $or: [{ userId, friendId }, { userId: friendId, friendId: userId }], status: 'accepted' });
    if (!friendship) throw new NotFoundException('Relation d\'amitié non trouvée');
    friendship.status = 'deleted';
    friendship.deletedBy = new Types.ObjectId(userId);
    await friendship.save();
    const otherUserId = friendship.userId.toString() === userId ? friendship.friendId.toString() : friendship.userId.toString();
    this.chatGateway?.notifyUser(otherUserId, 'friendRemoved', { by: userId });
    return { message: 'Ami supprimé', success: true };
  }

  async blockUser(userId: string, userToBlockId: string) {
    if (userId === userToBlockId) throw new BadRequestException('Vous ne pouvez pas vous bloquer vous-même');
    const userObjectId = new Types.ObjectId(userId), blockObjectId = new Types.ObjectId(userToBlockId);
    let friendship = await this.friendModel.findOne({ $or: [{ userId: userObjectId, friendId: blockObjectId }, { userId: blockObjectId, friendId: userObjectId }] });
    if (friendship) {
      friendship.status = 'blocked';
      friendship.blockedBy = userObjectId;
      await friendship.save();
    } else {
      friendship = new this.friendModel({ userId: userObjectId, friendId: blockObjectId, status: 'blocked', blockedBy: userObjectId });
      await friendship.save();
    }
    this.chatGateway?.notifyUser(userToBlockId, 'userBlocked', { by: userId });
    return { message: 'Utilisateur bloqué', success: true };
  }

  async unblockUser(userId: string, userToUnblockId: string) {
    const friendship = await this.friendModel.findOne({ $or: [{ userId, friendId: userToUnblockId, status: 'blocked', blockedBy: userId }, { userId: userToUnblockId, friendId: userId, status: 'blocked', blockedBy: userId }] });
    if (!friendship) throw new NotFoundException('Relation bloquée non trouvée');
    await friendship.deleteOne();
    this.chatGateway?.notifyUser(userToUnblockId, 'userUnblocked', { by: userId });
    return { message: 'Utilisateur débloqué', success: true };
  }

  async checkBlockStatus(userId: string, otherUserId: string) {
    const friendship = await this.friendModel.findOne({ $or: [{ userId, friendId: otherUserId }, { userId: otherUserId, friendId: userId }] });
    if (!friendship) return { isBlocked: false, canMessage: true };
    const isBlocked = friendship.status === 'blocked';
    return { isBlocked, blockedBy: friendship.blockedBy?.toString(), canMessage: !isBlocked };
  }

  async searchUsers(query: string, currentUserId: string) {
    const users = await this.userModel.find({ $or: [{ firstName: { $regex: query, $options: 'i' } }, { lastName: { $regex: query, $options: 'i' } }, { email: { $regex: query, $options: 'i' } }], _id: { $ne: new Types.ObjectId(currentUserId) } }).limit(10).select('firstName lastName email phoneNumber profilePicture').lean();
    const currentUserObjectId = new Types.ObjectId(currentUserId);
    return Promise.all(users.map(async (user) => {
      const friendship = await this.friendModel.findOne({ $or: [{ userId: currentUserObjectId, friendId: user._id }, { userId: user._id, friendId: currentUserObjectId }] });
      return { id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email, phoneNumber: user.phoneNumber, profilePicture: user.profilePicture, isFriend: friendship?.status === 'accepted', hasPendingRequest: friendship?.status === 'pending', isBlocked: friendship?.status === 'blocked', blockedBy: friendship?.blockedBy?.toString() };
    }));
  }

  async getBlockedUsers(userId: string): Promise<any[]> {
    const userObjectId = new Types.ObjectId(userId);
    const blockedRelations = await this.friendModel
      .find({
        $or: [{ userId: userObjectId }, { friendId: userObjectId }],
        status: 'blocked',
        blockedBy: userObjectId,
      })
      .populate('userId', 'firstName lastName email phoneNumber profilePicture')
      .populate('friendId', 'firstName lastName email phoneNumber profilePicture')
      .exec();

    return blockedRelations.map(f => {
      const blockedUser = f.userId._id.toString() === userId ? f.friendId : f.userId;
      return {
        id: f._id,
        userId: f.userId._id,
        friendId: f.friendId._id,
        status: f.status,
        blockedBy: f.blockedBy,
        createdAt: f.createdAt,
        friend: blockedUser,
      };
    });
  }

  async getSuggestions(userId: string): Promise<any[]> {
    const userObjectId = new Types.ObjectId(userId);
    const existingFriends = await this.friendModel.find({
      $or: [{ userId: userObjectId }, { friendId: userObjectId }],
    });

    const existingFriendIds = existingFriends.map(f =>
      f.userId.toString() === userId ? f.friendId.toString() : f.userId.toString()
    );
    existingFriendIds.push(userId);

    const suggestions = await this.userModel
      .find({
        _id: { $nin: existingFriendIds.map(id => new Types.ObjectId(id)) },
        isActive: true,
      })
      .limit(10)
      .select('firstName lastName email phoneNumber profilePicture')
      .lean()
      .exec();

    return suggestions.map(s => ({
      id: s._id,
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email,
      phoneNumber: s.phoneNumber,
      profilePicture: s.profilePicture,
      isFriend: false,
      hasPendingRequest: false,
      isBlocked: false,
    }));
  }

  // ✅ Méthode ajoutée à l'intérieur de la classe
  async findUsersByPhones(phones: string[], currentUserId: string): Promise<any[]> {
    const cleanPhones = phones.map(p => p.replace(/\s/g, '').replace(/[^0-9]/g, ''));
    const users = await this.userModel.find({
      phoneNumber: { $in: cleanPhones },
      _id: { $ne: new Types.ObjectId(currentUserId) },
      isActive: true
    }).select('firstName lastName email phoneNumber profilePicture isOnline lastSeen').lean();

    const existingFriends = await this.friendModel.find({
      $or: [{ userId: currentUserId }, { friendId: currentUserId }],
      status: { $in: ['accepted', 'pending', 'blocked'] }
    });
    const excludedIds = existingFriends.map(f =>
      f.userId.toString() === currentUserId ? f.friendId.toString() : f.userId.toString()
    );

    return users
      .filter(u => !excludedIds.includes(u._id.toString()))
      .map(u => ({
        id: u._id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        profilePicture: u.profilePicture,
        isFriend: false,
        hasPendingRequest: false,
        isBlocked: false
      }));
  }
}