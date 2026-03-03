import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Friend, FriendDocument } from './schemas/friend.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class FriendsService {
  constructor(
    @InjectModel(Friend.name) private friendModel: Model<FriendDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  /**
   * Récupérer la liste des amis d'un utilisateur
   */
  async getFriends(userId: string): Promise<any[]> {
    const objectId = new Types.ObjectId(userId);
    
    const friends = await this.friendModel
      .find({
        $or: [{ userId: objectId }, { friendId: objectId }],
        status: 'accepted',
      })
      .populate('userId', 'firstName lastName email phoneNumber profilePicture')
      .populate('friendId', 'firstName lastName email phoneNumber profilePicture')
      .exec();

    return friends.map(friend => {
      const isUserSender = friend.userId._id.toString() === userId;
      return {
        id: friend._id,
        userId: friend.userId._id,
        friendId: friend.friendId._id,
        status: friend.status,
        createdAt: friend.createdAt,
        updatedAt: friend.updatedAt,
        friend: isUserSender ? friend.friendId : friend.userId,
      };
    });
  }

  /**
   * Récupérer les demandes d'amis reçues
   */
  async getFriendRequests(userId: string): Promise<any[]> {
    const objectId = new Types.ObjectId(userId);
    
    const requests = await this.friendModel
      .find({
        friendId: objectId,
        status: 'pending',
      })
      .populate('userId', 'firstName lastName email profilePicture')
      .exec();

    return requests.map(request => ({
      id: request._id,
      senderId: request.userId._id,
      receiverId: request.friendId._id,
      status: request.status,
      createdAt: request.createdAt,
      sender: request.userId,
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

    // Vérifier si l'utilisateur cible existe
    const friendExists = await this.userModel.findById(friendObjectId);
    if (!friendExists) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    // Vérifier si une relation existe déjà
    const existingRelation = await this.friendModel.findOne({
      $or: [
        { userId: userObjectId, friendId: friendObjectId },
        { userId: friendObjectId, friendId: userObjectId },
      ],
    });

    if (existingRelation) {
      throw new BadRequestException('Une relation existe déjà avec cet utilisateur');
    }

    // Créer la demande
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
    const objectId = new Types.ObjectId(requestId);
    
    const request = await this.friendModel.findById(objectId);
    if (!request) {
      throw new NotFoundException('Demande non trouvée');
    }

    if (request.friendId.toString() !== userId) {
      throw new BadRequestException('Vous n\'êtes pas autorisé à accepter cette demande');
    }

    request.status = 'accepted';
    await request.save();

    return { message: 'Demande d\'ami acceptée' };
  }

  /**
   * Refuser une demande d'ami
   */
  async declineFriendRequest(userId: string, requestId: string): Promise<any> {
    const objectId = new Types.ObjectId(requestId);
    
    const request = await this.friendModel.findById(objectId);
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
   * Récupérer les suggestions d'amis
   */
  async getFriendSuggestions(userId: string, limit: number = 10): Promise<any[]> {
    const objectId = new Types.ObjectId(userId);

    // Récupérer les IDs des amis existants
    const existingFriends = await this.friendModel.find({
      $or: [{ userId: objectId }, { friendId: objectId }],
    });

    const existingFriendIds = existingFriends.map(f => 
      f.userId.toString() === userId ? f.friendId.toString() : f.userId.toString()
    );
    existingFriendIds.push(userId); // Exclure soi-même

    // Trouver des utilisateurs qui ne sont pas encore amis
    const suggestions = await this.userModel
      .find({
        _id: { $nin: existingFriendIds.map(id => new Types.ObjectId(id)) },
        isActive: true,
      })
      .limit(limit)
      .select('firstName lastName email phoneNumber profilePicture')
      .exec();

    return suggestions;
  }

  /**
   * Vérifier le statut d'amitié avec un utilisateur
   */
  async getFriendStatus(userId: string, otherUserId: string): Promise<any> {
    const userObjectId = new Types.ObjectId(userId);
    const otherObjectId = new Types.ObjectId(otherUserId);

    const relation = await this.friendModel.findOne({
      $or: [
        { userId: userObjectId, friendId: otherObjectId },
        { userId: otherObjectId, friendId: userObjectId },
      ],
    });

    if (!relation) {
      return { status: 'none' };
    }

    if (relation.status === 'accepted') {
      return { status: 'friends' };
    }

    if (relation.status === 'pending') {
      const isSender = relation.userId.toString() === userId;
      return { 
        status: 'pending',
        direction: isSender ? 'sent' : 'received'
      };
    }

    return { status: relation.status };
  }
}