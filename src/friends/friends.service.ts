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

  async sendFriendRequest(userId: string, friendId: string): Promise<any> {
    if (userId === friendId) {
      throw new BadRequestException('Vous ne pouvez pas vous ajouter vous-même');
    }

    try {
      const userObjectId = new Types.ObjectId(userId);
      const friendObjectId = new Types.ObjectId(friendId);

      const userExists = await this.userModel.findById(userObjectId);
      const friendExists = await this.userModel.findById(friendObjectId);
      
      if (!userExists || !friendExists) {
        throw new NotFoundException('Utilisateur non trouvé');
      }

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
        if (existing.status === 'pending') {
          throw new BadRequestException('Une demande est déjà en attente');
        }
        if (existing.status === 'accepted') {
          throw new BadRequestException('Vous êtes déjà amis avec cet utilisateur');
        }
        if (existing.status === 'deleted') {
          existing.status = 'pending';
          existing.deletedBy = undefined;
          existing.updatedAt = new Date();
          await existing.save();
          
          if (this.chatGateway) {
            this.chatGateway.notifyUser(friendId, 'friendRequest', {
              from: userId,
              requestId: existing._id,
            });
          }
          
          return { 
            message: 'Demande d\'ami renvoyée', 
            success: true,
            requestId: existing._id 
          };
        }
      }

      const friendRequest = new this.friendModel({
        userId: userObjectId,
        friendId: friendObjectId,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await friendRequest.save();
      
      if (this.chatGateway) {
        this.chatGateway.notifyUser(friendId, 'friendRequest', {
          from: userId,
          requestId: friendRequest._id,
        });
      }

      return { 
        message: 'Demande d\'ami envoyée', 
        success: true,
        requestId: friendRequest._id 
      };
    
    } catch (error) {
      console.error('❌ Erreur dans sendFriendRequest:', error);
      throw error;
    }
  }

  async acceptFriendRequest(userId: string, requestId: string): Promise<any> {
    try {
      if (!Types.ObjectId.isValid(requestId) || !Types.ObjectId.isValid(userId)) {
        throw new BadRequestException('ID invalide');
      }
      
      const requestObjectId = new Types.ObjectId(requestId);
      const userObjectId = new Types.ObjectId(userId);
      
      const request = await this.friendModel.findById(requestObjectId);
      
      if (!request) {
        throw new NotFoundException('Demande non trouvée');
      }
      
      if (request.friendId.toString() !== userId.toString()) {
        throw new ForbiddenException(`Vous n'êtes pas autorisé à accepter cette demande`);
      }
      
      if (request.status !== 'pending') {
        throw new BadRequestException(`Cette demande n'est pas en attente (statut: ${request.status})`);
      }
      
      request.status = 'accepted';
      request.updatedAt = new Date();
      await request.save();
      
      let conversation;
      try {
        conversation = await this.conversationsService.createConversation([
          request.userId.toString(),
          request.friendId.toString(),
        ]);
      } catch (convError) {
        console.error('❌ Erreur création conversation:', convError);
      }
      
      try {
        if (conversation) {
          await this.conversationsService.sendMessage(
            conversation._id.toString(),
            'system',
            '👋 Vous êtes maintenant amis ! Commencez à discuter.',
            'text'
          );
        }
      } catch (msgError) {
        console.error('❌ Erreur envoi message:', msgError);
      }
    
      try {
        if (this.chatGateway) {
          this.chatGateway.notifyUser(request.userId.toString(), 'friendRequestAccepted', {
            by: userId,
            conversationId: conversation?._id,
          });
        }
      } catch (notifyError) {
        console.error('❌ Erreur notification:', notifyError);
      }
    
      return { 
        message: 'Demande d\'ami acceptée',
        conversationId: conversation?._id,
        success: true,
      };
    
    } catch (error) {
      console.error('❌ Erreur dans acceptFriendRequest:', error);
      throw error;
    }
  }

  async declineFriendRequest(userId: string, requestId: string): Promise<any> {
    try {
      if (!Types.ObjectId.isValid(requestId) || !Types.ObjectId.isValid(userId)) {
        throw new BadRequestException('ID invalide');
      }
      
      const requestObjectId = new Types.ObjectId(requestId);
      
      const request = await this.friendModel.findById(requestObjectId);
      
      if (!request) {
        throw new NotFoundException('Demande non trouvée');
      }
      
      if (request.friendId.toString() !== userId.toString()) {
        throw new ForbiddenException(`Vous n'êtes pas autorisé à refuser cette demande`);
      }
      
      if (request.status !== 'pending') {
        throw new BadRequestException(`Cette demande n'est pas en attente (statut: ${request.status})`);
      }
      
      await request.deleteOne();
      
      try {
        if (this.chatGateway) {
          this.chatGateway.notifyUser(request.userId.toString(), 'friendRequestDeclined', {
            by: userId,
          });
        }
      } catch (notifyError) {
        console.error('❌ Erreur notification:', notifyError);
      }
      
      return { 
        message: 'Demande d\'ami refusée', 
        success: true 
      };
      
    } catch (error) {
      console.error('❌ Erreur dans declineFriendRequest:', error);
      throw error;
    }
  }

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

    friendship.status = 'deleted';
    friendship.deletedBy = userObjectId;
    await friendship.save();

    const otherUserId = friendship.userId.toString() === userId 
      ? friendship.friendId.toString() 
      : friendship.userId.toString();
    
    this.chatGateway.notifyUser(otherUserId, 'friendRemoved', {
      by: userId,
    });

    return { message: 'Ami supprimé', success: true };
  }

  async blockUser(userId: string, userToBlockId: string): Promise<any> {
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
      friendship.deletedBy = undefined;
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

    this.chatGateway.notifyUser(userToBlockId, 'userBlocked', {
      by: userId,
    });

    return { message: 'Utilisateur bloqué', success: true };
  }

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

    await friendship.deleteOne();

    this.chatGateway.notifyUser(userToUnblockId, 'userUnblocked', {
      by: userId,
    });

    return { message: 'Utilisateur débloqué', success: true };
  }

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
}