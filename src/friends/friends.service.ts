// backend/src/friends/friends.service.ts
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

  // ============================================================
  // RÉCUPÉRATION DES AMIS
  // ============================================================

  /**
   * Récupère la liste des amis acceptés d'un utilisateur
   * 🔥 CORRECTION : retourne le bon ID de l'ami
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

    console.log(`🔍 getFriends: ${friendships.length} relations trouvées pour ${userId}`);

    // Filtrer les relations où l'un des côtés est null
    const validFriendships = friendships.filter(f => f.userId && f.friendId);
    console.log(`✅ ${validFriendships.length} relations valides`);

    return validFriendships.map((f) => {
      const user = f.userId as any;
      const friend = f.friendId as any;
      
      // 🔥 CORRECTION : Déterminer correctement qui est l'ami
      const isCurrentUser = user._id.toString() === userId;
      const friendObj = isCurrentUser ? friend : user;
      const friendId = isCurrentUser ? friend._id.toString() : user._id.toString();
      const userIdForRecord = isCurrentUser ? user._id.toString() : friend._id.toString();
      
      console.log(`  - Ami: ${friendId} (${friendObj.firstName} ${friendObj.lastName})`);
      
      return {
        id: f._id,
        userId: userIdForRecord,
        friendId: friendId,
        status: f.status,
        friend: friendObj,
      };
    });
  }

  /**
   * Récupère les demandes d'ami reçues
   */
  async getFriendRequests(userId: string): Promise<any[]> {
    const requests = await this.friendModel
      .find({
        friendId: new Types.ObjectId(userId),
        status: 'pending',
      })
      .populate('userId', 'firstName lastName email profilePicture')
      .exec();

    // Filtrer les demandes dont l'expéditeur existe encore
    return requests
      .filter(r => r.userId)
      .map((r) => {
        const sender = r.userId as any;
        return {
          id: r._id,
          senderId: sender._id.toString(),
          receiverId: r.friendId.toString(),
          status: r.status,
          sender: {
            id: sender._id.toString(),
            firstName: sender.firstName,
            lastName: sender.lastName,
            email: sender.email,
            profilePicture: sender.profilePicture,
          },
        };
      });
  }

  /**
   * Récupère les utilisateurs bloqués
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

    return blockedRelations
      .filter(f => f.userId && f.friendId)
      .map((f) => {
        const user = f.userId as any;
        const friend = f.friendId as any;
        const isCurrentUser = user._id.toString() === userId;
        const blockedUser = isCurrentUser ? friend : user;
        const blockedUserId = isCurrentUser ? friend._id.toString() : user._id.toString();
        
        return {
          id: f._id,
          userId: isCurrentUser ? user._id.toString() : friend._id.toString(),
          friendId: blockedUserId,
          status: f.status,
          blockedBy: f.blockedBy?.toString(),
          createdAt: f.createdAt,
          friend: blockedUser,
        };
      });
  }

  /**
   * Suggestions d'amis
   */
  async getSuggestions(userId: string): Promise<any[]> {
    const userObjectId = new Types.ObjectId(userId);
    const existingFriends = await this.friendModel.find({
      $or: [{ userId: userObjectId }, { friendId: userObjectId }],
    });

    const existingFriendIds = existingFriends
      .map((f) => {
        const uid = f.userId?.toString();
        const fid = f.friendId?.toString();
        return uid === userId ? fid : uid;
      })
      .filter(id => id && id !== userId) as string[];

    const suggestions = await this.userModel
      .find({
        _id: { $nin: [...existingFriendIds, userId].map(id => new Types.ObjectId(id)) },
        isActive: true,
      })
      .limit(10)
      .select('firstName lastName email phoneNumber profilePicture')
      .lean()
      .exec();

    return suggestions.map((s) => ({
      id: s._id.toString(),
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

  /**
   * Recherche d'utilisateurs
   */
  async searchUsers(query: string, currentUserId: string): Promise<any[]> {
    const users = await this.userModel
      .find({
        $or: [
          { firstName: { $regex: query, $options: 'i' } },
          { lastName: { $regex: query, $options: 'i' } },
          { email: { $regex: query, $options: 'i' } },
        ],
        _id: { $ne: new Types.ObjectId(currentUserId) },
      })
      .limit(10)
      .select('firstName lastName email phoneNumber profilePicture')
      .lean();

    const currentUserObjectId = new Types.ObjectId(currentUserId);

    return Promise.all(
      users.map(async (user) => {
        const friendship = await this.friendModel.findOne({
          $or: [
            { userId: currentUserObjectId, friendId: user._id },
            { userId: user._id, friendId: currentUserObjectId },
          ],
        });

        return {
          id: user._id.toString(),
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
      }),
    );
  }

  /**
   * Trouver des utilisateurs par téléphone
   */
  async findUsersByPhones(phones: string[], currentUserId: string): Promise<any[]> {
    const cleanPhones = phones.map((p) => p.replace(/\s/g, '').replace(/[^0-9]/g, ''));
    const users = await this.userModel
      .find({
        phoneNumber: { $in: cleanPhones },
        _id: { $ne: new Types.ObjectId(currentUserId) },
        isActive: true,
      })
      .select('firstName lastName email phoneNumber profilePicture isOnline lastSeen')
      .lean();

    const existingFriends = await this.friendModel.find({
      $or: [{ userId: currentUserId }, { friendId: currentUserId }],
      status: { $in: ['accepted', 'pending', 'blocked'] },
    });
    const excludedIds = existingFriends
      .map((f) => {
        const uid = f.userId?.toString();
        const fid = f.friendId?.toString();
        return uid === currentUserId ? fid : uid;
      })
      .filter(id => id) as string[];

    return users
      .filter((u) => !excludedIds.includes(u._id.toString()))
      .map((u) => ({
        id: u._id.toString(),
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        profilePicture: u.profilePicture,
        isFriend: false,
        hasPendingRequest: false,
        isBlocked: false,
      }));
  }

  /**
   * Vérification de blocage (utilisée par le chat)
   */
  async checkBlockStatus(userId: string, otherUserId: string) {
    const friendship = await this.friendModel.findOne({
      $or: [
        { userId, friendId: otherUserId },
        { userId: otherUserId, friendId: userId },
      ],
    });

    if (!friendship) {
      return { isBlocked: false, canMessage: true };
    }

    const isBlocked = friendship.status === 'blocked';
    return {
      isBlocked,
      blockedBy: friendship.blockedBy?.toString(),
      canMessage: !isBlocked,
    };
  }

  // ============================================================
  // ACTIONS
  // ============================================================

  /**
   * Envoie une demande d'ami
   */
  async sendFriendRequest(userId: string, friendId: string) {
    if (userId === friendId) {
      throw new BadRequestException('Vous ne pouvez pas vous ajouter vous-même');
    }

    const userObjectId = new Types.ObjectId(userId);
    const friendObjectId = new Types.ObjectId(friendId);

    const friendExists = await this.userModel.findById(friendObjectId);
    if (!friendExists) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    let friendship = await this.friendModel.findOne({
      $or: [
        { userId: userObjectId, friendId: friendObjectId },
        { userId: friendObjectId, friendId: userObjectId },
      ],
    });

    if (friendship) {
      if (friendship.status === 'blocked') {
        throw new ForbiddenException('Impossible d\'envoyer une demande à un utilisateur bloqué');
      }
      if (friendship.status === 'pending') {
        throw new BadRequestException('Une demande est déjà en attente');
      }
      if (friendship.status === 'accepted') {
        throw new BadRequestException('Vous êtes déjà amis');
      }
      if (friendship.status === 'deleted') {
        friendship.status = 'pending';
        friendship.deletedBy = undefined;
        await friendship.save();
        this.chatGateway?.notifyUser(friendId, 'friendRequest', {
          from: userId,
          requestId: friendship._id,
        });
        return {
          message: 'Demande d\'ami renvoyée',
          success: true,
          requestId: friendship._id,
        };
      }
    } else {
      friendship = new this.friendModel({
        userId: userObjectId,
        friendId: friendObjectId,
        status: 'pending',
      });
      await friendship.save();
    }

    this.chatGateway?.notifyUser(friendId, 'friendRequest', {
      from: userId,
      requestId: friendship._id,
    });

    return {
      message: 'Demande d\'ami envoyée',
      success: true,
      requestId: friendship._id,
    };
  }

  /**
   * Accepte une demande d'ami
   */
  async acceptFriendRequest(userId: string, requestId: string) {
    const request = await this.friendModel.findById(requestId);
    if (!request) {
      throw new NotFoundException('Demande non trouvée');
    }
    if (request.friendId.toString() !== userId) {
      throw new ForbiddenException('Non autorisé');
    }
    if (request.status !== 'pending') {
      throw new BadRequestException('Demande déjà traitée');
    }

    request.status = 'accepted';
    await request.save();

    await this.userModel.findByIdAndUpdate(request.userId, {
      $addToSet: { friends: request.friendId },
    });
    await this.userModel.findByIdAndUpdate(request.friendId, {
      $addToSet: { friends: request.userId },
    });

    let conversation;
    try {
      conversation = await this.conversationsService.createConversation([
        request.userId.toString(),
        request.friendId.toString(),
      ]);
      if (conversation) {
        await this.conversationsService.sendMessage(
          conversation._id.toString(),
          'system',
          '👋 Vous êtes maintenant amis ! Commencez à discuter.',
          'text',
        );
      }
    } catch (e) {
      console.error('Erreur création conversation:', e);
    }

    this.chatGateway?.notifyUser(request.userId.toString(), 'friendRequestAccepted', {
      by: userId,
      conversationId: conversation?._id,
    });

    return {
      message: 'Demande d\'ami acceptée',
      conversationId: conversation?._id,
      success: true,
    };
  }

  /**
   * Refuse une demande d'ami
   */
  async declineFriendRequest(userId: string, requestId: string) {
    const request = await this.friendModel.findById(requestId);
    if (!request) {
      throw new NotFoundException('Demande non trouvée');
    }
    if (request.friendId.toString() !== userId) {
      throw new ForbiddenException('Non autorisé');
    }
    if (request.status !== 'pending') {
      throw new BadRequestException('Demande déjà traitée');
    }

    await request.deleteOne();
    this.chatGateway?.notifyUser(request.userId.toString(), 'friendRequestDeclined', {
      by: userId,
    });

    return {
      message: 'Demande d\'ami refusée',
      success: true,
    };
  }

  /**
   * Supprime un ami
   */
  async removeFriend(userId: string, friendId: string) {
    const friendship = await this.friendModel.findOne({
      $or: [
        { userId, friendId },
        { userId: friendId, friendId: userId },
      ],
      status: 'accepted',
    });

    if (!friendship) {
      throw new NotFoundException('Relation d\'amitié non trouvée');
    }

    friendship.status = 'deleted';
    friendship.deletedBy = new Types.ObjectId(userId);
    await friendship.save();

    await this.userModel.findByIdAndUpdate(userId, { $pull: { friends: friendId } });
    await this.userModel.findByIdAndUpdate(friendId, { $pull: { friends: userId } });

    const otherUserId = friendship.userId.toString() === userId
      ? friendship.friendId.toString()
      : friendship.userId.toString();

    this.chatGateway?.notifyUser(otherUserId, 'friendRemoved', { by: userId });

    return {
      message: 'Ami supprimé',
      success: true,
    };
  }

  /**
   * Bloque un utilisateur
   */
  async blockUser(userId: string, userToBlockId: string) {
    if (userId === userToBlockId) {
      throw new BadRequestException('Vous ne pouvez pas vous bloquer vous-même');
    }

    const userObjectId = new Types.ObjectId(userId);
    const blockObjectId = new Types.ObjectId(userToBlockId);

    let friendship = await this.friendModel.findOne({
      $or: [
        { userId: userObjectId, friendId: blockObjectId },
        { userId: blockObjectId, friendId: userObjectId },
      ],
    });

    if (friendship) {
      friendship.status = 'blocked';
      friendship.blockedBy = userObjectId;
      await friendship.save();
    } else {
      friendship = new this.friendModel({
        userId: userObjectId,
        friendId: blockObjectId,
        status: 'blocked',
        blockedBy: userObjectId,
      });
      await friendship.save();
    }

    await this.userModel.findByIdAndUpdate(userId, { $pull: { friends: userToBlockId } });
    await this.userModel.findByIdAndUpdate(userToBlockId, { $pull: { friends: userId } });

    this.chatGateway?.notifyUser(userToBlockId, 'userBlocked', { by: userId });

    return {
      message: 'Utilisateur bloqué',
      success: true,
    };
  }

  /**
   * Débloque un utilisateur
   */
  async unblockUser(userId: string, userToUnblockId: string) {
    const friendship = await this.friendModel.findOne({
      $or: [
        { userId, friendId: userToUnblockId, status: 'blocked', blockedBy: userId },
        { userId: userToUnblockId, friendId: userId, status: 'blocked', blockedBy: userId },
      ],
    });

    if (!friendship) {
      throw new NotFoundException('Relation bloquée non trouvée');
    }

    await friendship.deleteOne();
    this.chatGateway?.notifyUser(userToUnblockId, 'userUnblocked', { by: userId });

    return {
      message: 'Utilisateur débloqué',
      success: true,
    };
  }
}