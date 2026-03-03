import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Friend, FriendDocument } from './schemas/friend.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { ConversationsService } from '../conversations/conversations.service';

@Injectable()
export class FriendsService {
  constructor(
    @InjectModel(Friend.name) private friendModel: Model<FriendDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private conversationsService: ConversationsService,
  ) {}

  /**
   * Récupérer la liste des amis
   */
  async getFriends(userId: string): Promise<any[]> {
    const userObjectId = new Types.ObjectId(userId);
    
    const friendships = await this.friendModel
      .find({
        $or: [{ userId: userObjectId }, { friendId: userObjectId }],
        status: 'accepted',
      })
      .populate('userId', 'firstName lastName email phoneNumber profilePicture')
      .populate('friendId', 'firstName lastName email phoneNumber profilePicture')
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
      throw new BadRequestException('Une relation existe déjà avec cet utilisateur');
    }

    const friendRequest = new this.friendModel({
      userId: userObjectId,
      friendId: friendObjectId,
      status: 'pending',
    });

    await friendRequest.save();
    return { message: 'Demande d\'ami envoyée' };
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

    return { 
      message: 'Demande d\'ami acceptée',
      conversationId: conversation._id 
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
    return { message: 'Demande d\'ami refusée' };
  }

  /**
   * Supprimer un ami
   */
  async removeFriend(userId: string, friendId: string): Promise<any> {
    const userObjectId = new Types.ObjectId(userId);
    const friendObjectId = new Types.ObjectId(friendId);

    const result = await this.friendModel.findOneAndDelete({
      $or: [
        { userId: userObjectId, friendId: friendObjectId },
        { userId: friendObjectId, friendId: userObjectId },
      ],
      status: 'accepted',
    });

    if (!result) {
      throw new NotFoundException('Relation d\'amitié non trouvée');
    }

    return { message: 'Ami supprimé' };
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
    }));
  }
}