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

  /**
   * Récupérer la liste des amis (uniquement acceptés)
   */
  async getFriends(userId: string): Promise<any[]> {
    const userObjectId = new Types.ObjectId(userId);
    
    const friendships = await this.friendModel
      .find({
        $or: [{ userId: userObjectId }, { friendId: userObjectId }],
        status: 'accepted',
      })
      .populate('userId', 'firstName lastName email phoneNumber profilePicture isOnline lastSeen')
      .populate('friendId', 'firstName lastName email phoneNumber profilePicture isOnline lastSeen')
      .exec();

    return friendships.map(f => {
      const isUserSender = f.userId._id.toString() === userId;
      return {
        id: f._id,
        userId: f.userId._id,
        friendId: f.friendId._id,
        status: f.status,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
        friend: isUserSender ? f.friendId : f.userId,
      };
    });
  }

  /**
  * Récupérer les utilisateurs bloqués
  */
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
  
  /**
   * Récupérer les demandes d'amis reçues
   */
  async getFriendRequests(userId: string): Promise<any[]> {
    const userObjectId = new Types.ObjectId(userId);
    
    const requests = await this.friendModel
      .find({
        friendId: userObjectId,
        status: 'pending',
      })
      .populate('userId', 'firstName lastName email profilePicture')
      .exec();

    return requests.map(r => ({
      id: r._id,
      senderId: r.userId._id,
      receiverId: r.friendId._id,
      status: r.status,
      createdAt: r.createdAt,
      sender: r.userId,
    }));
  }

  /**
   * Envoyer une demande d'ami
   */
  async sendFriendRequest(userId: string, friendId: string): Promise<any> {
    if (userId === friendId) {
      throw new BadRequestException('Vous ne pouvez pas vous ajouter vous-même');
    }

    const userObjectId = new Types.ObjectId(userId);
    const friendObjectId = new Types.ObjectId(friendId);

    // Vérifier si l'utilisateur existe
    const friendExists = await this.userModel.findById(friendObjectId);
    if (!friendExists) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    // Vérifier si une relation existe déjà
    const existing = await this.friendModel.findOne({
      $or: [
        { userId: userObjectId, friendId: friendObjectId },
        { userId: friendObjectId, friendId: userObjectId },
      ],
    });

    if (existing) {
      if (existing.status === 'blocked') {
        throw new ForbiddenException('Impossible d\'envoyer une demande à un utilisateur bloqué');
      }
      if (existing.status === 'deleted') {
        // Réactiver la relation
        existing.status = 'pending';
        existing.deletedBy = undefined;
        await existing.save();
        return { message: 'Demande d\'ami renvoyée', success: true };
      }
      throw new BadRequestException('Une relation existe déjà avec cet utilisateur');
    }

    const friendRequest = new this.friendModel({
      userId: userObjectId,
      friendId: friendObjectId,
      status: 'pending',
    });

    await friendRequest.save();
    
    // Notifier via WebSocket
    this.chatGateway.notifyUser(friendId, 'friendRequest', {
      from: userId,
      requestId: friendRequest._id,
    });

    return { message: 'Demande d\'ami envoyée', success: true };
  }

  /**
   * Accepter une demande d'ami
   */
  async acceptFriendRequest(userId: string, requestId: string): Promise<any> {
    const request = await this.friendModel.findById(requestId);
    if (!request) {
      throw new NotFoundException('Demande non trouvée');
    }

    if (request.friendId.toString() !== userId) {
      throw new BadRequestException('Vous n\'êtes pas autorisé à accepter cette demande');
    }

    request.status = 'accepted';
    await request.save();

    // Créer une conversation entre les deux utilisateurs
    const conversation = await this.conversationsService.createConversation([
      request.userId.toString(),
      request.friendId.toString(),
    ]);

    // Envoyer un message de bienvenue
    const welcomeMessage = `👋 Vous êtes maintenant amis ! Commencez à discuter.`;
    await this.conversationsService.sendMessage(
      conversation._id.toString(),
      'system',
      welcomeMessage,
      'text'
    );

    // Notifier via WebSocket
    this.chatGateway.notifyUser(request.userId.toString(), 'friendRequestAccepted', {
      by: userId,
      conversationId: conversation._id,
    });

    return { 
      message: 'Demande d\'ami acceptée',
      conversationId: conversation._id,
      success: true,
    };
  }

  /**
   * Refuser une demande d'ami
   */
  async declineFriendRequest(userId: string, requestId: string): Promise<any> {
    const request = await this.friendModel.findById(requestId);
    if (!request) {
      throw new NotFoundException('Demande non trouvée');
    }

    if (request.friendId.toString() !== userId) {
      throw new BadRequestException('Vous n\'êtes pas autorisé à refuser cette demande');
    }

    await request.deleteOne();
    
    // Notifier via WebSocket
    this.chatGateway.notifyUser(request.userId.toString(), 'friendRequestDeclined', {
      by: userId,
    });

    return { message: 'Demande d\'ami refusée', success: true };
  }

  /**
   * Supprimer un ami
   */
  async removeFriend(userId: string, friendId: string): Promise<any> {
    const userObjectId = new Types.ObjectId(userId);
    const friendObjectId = new Types.ObjectId(friendId);

    const friendship = await this.friendModel.findOne({
      $or: [
        { userId: userObjectId, friendId: friendObjectId },
        { userId: friendObjectId, friendId: userObjectId },
      ],
      status: 'accepted',
    });

    if (!friendship) {
      throw new NotFoundException('Relation d\'amitié non trouvée');
    }

    // Marquer comme supprimé par cet utilisateur
    friendship.status = 'deleted';
    friendship.deletedBy = userObjectId;
    await friendship.save();

    // Notifier l'autre utilisateur
    const otherUserId = friendship.userId.toString() === userId 
      ? friendship.friendId.toString() 
      : friendship.userId.toString();
    
    this.chatGateway.notifyUser(otherUserId, 'friendRemoved', {
      by: userId,
    });

    return { message: 'Ami supprimé', success: true };
  }

  /**
   * Bloquer un utilisateur
   */
  async blockUser(userId: string, userToBlockId: string): Promise<any> {
    if (userId === userToBlockId) {
      throw new BadRequestException('Vous ne pouvez pas vous bloquer vous-même');
    }

    const userObjectId = new Types.ObjectId(userId);
    const blockObjectId = new Types.ObjectId(userToBlockId);

    // Vérifier si une relation existe
    let friendship = await this.friendModel.findOne({
      $or: [
        { userId: userObjectId, friendId: blockObjectId },
        { userId: blockObjectId, friendId: userObjectId },
      ],
    });

    if (friendship) {
      // Mettre à jour la relation existante
      friendship.status = 'blocked';
      friendship.blockedBy = userObjectId;
      friendship.deletedBy = undefined;
      await friendship.save();
    } else {
      // Créer une nouvelle relation bloquée
      friendship = new this.friendModel({
        userId: userObjectId,
        friendId: blockObjectId,
        status: 'blocked',
        blockedBy: userObjectId,
      });
      await friendship.save();
    }

    // Notifier via WebSocket
    this.chatGateway.notifyUser(userToBlockId, 'userBlocked', {
      by: userId,
    });

    return { message: 'Utilisateur bloqué', success: true };
  }

  /**
   * Débloquer un utilisateur
   */
  async unblockUser(userId: string, userToUnblockId: string): Promise<any> {
    const userObjectId = new Types.ObjectId(userId);
    const unblockObjectId = new Types.ObjectId(userToUnblockId);

    const friendship = await this.friendModel.findOne({
      $or: [
        { userId: userObjectId, friendId: unblockObjectId, status: 'blocked', blockedBy: userObjectId },
        { userId: unblockObjectId, friendId: userObjectId, status: 'blocked', blockedBy: userObjectId },
      ],
    });

    if (!friendship) {
      throw new NotFoundException('Relation bloquée non trouvée');
    }

    // Supprimer la relation
    await friendship.deleteOne();

    // Notifier via WebSocket
    this.chatGateway.notifyUser(userToUnblockId, 'userUnblocked', {
      by: userId,
    });

    return { message: 'Utilisateur débloqué', success: true };
  }

  /**
   * Vérifier le statut de blocage entre deux utilisateurs
   */
  async checkBlockStatus(userId: string, otherUserId: string): Promise<{ isBlocked: boolean; blockedBy?: string; canMessage: boolean }> {
    const userObjectId = new Types.ObjectId(userId);
    const otherObjectId = new Types.ObjectId(otherUserId);

    const friendship = await this.friendModel.findOne({
      $or: [
        { userId: userObjectId, friendId: otherObjectId },
        { userId: otherObjectId, friendId: userObjectId },
      ],
    });

    if (!friendship) {
      return { isBlocked: false, canMessage: true };
    }

    const isBlocked = friendship.status === 'blocked';
    const blockedBy = friendship.blockedBy?.toString();

    return {
      isBlocked,
      blockedBy,
      canMessage: !isBlocked,
    };
  }

  /**
   * Rechercher des utilisateurs
   */
  async searchUsers(query: string, currentUserId: string): Promise<any[]> {
    const users = await this.userModel
      .find({
        $or: [
          { firstName: { $regex: query, $options: 'i' } },
          { lastName: { $regex: query, $options: 'i' } },
          { email: { $regex: query, $options: 'i' } },
          { phoneNumber: { $regex: query, $options: 'i' } },
        ],
        _id: { $ne: new Types.ObjectId(currentUserId) },
      })
      .limit(10)
      .select('firstName lastName email phoneNumber profilePicture')
      .lean()
      .exec();

    const currentUserObjectId = new Types.ObjectId(currentUserId);
    
    const results = await Promise.all(
      users.map(async (user) => {
        const friendship = await this.friendModel.findOne({
          $or: [
            { userId: currentUserObjectId, friendId: user._id },
            { userId: user._id, friendId: currentUserObjectId },
          ],
        });

        return {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          profilePicture: user.profilePicture,
          isFriend: friendship?.status === 'accepted',
          hasPendingRequest: friendship?.status === 'pending',
          isBlocked: friendship?.status === 'blocked',
          blockedBy: friendship?.blockedBy?.toString(),
        };
      })
    );

    return results;
  }

  /**
   * Récupérer les suggestions d'amis
   */
  async getSuggestions(userId: string): Promise<any[]> {
    const userObjectId = new Types.ObjectId(userId);

    // Récupérer les IDs des amis existants
    const existingFriends = await this.friendModel.find({
      $or: [{ userId: userObjectId }, { friendId: userObjectId }],
    });

    const existingFriendIds = existingFriends.map(f => 
      f.userId.toString() === userId ? f.friendId.toString() : f.userId.toString()
    );
    existingFriendIds.push(userId);

    // Trouver des utilisateurs qui ne sont pas encore amis
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
}