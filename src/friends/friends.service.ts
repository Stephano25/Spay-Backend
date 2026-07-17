// backend/src/friends/friends.service.ts
import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Friend, FriendDocument } from './schemas/friend.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { ConversationsService } from '../conversations/conversations.service';
import { ChatGateway } from '../chat/chat.gateway';

@Injectable()
export class FriendsService {
  private readonly logger = new Logger(FriendsService.name);

  constructor(
    @InjectModel(Friend.name) private friendModel: Model<FriendDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Inject(forwardRef(() => ConversationsService)) private conversationsService: ConversationsService,
    @Inject(forwardRef(() => ChatGateway)) private chatGateway: ChatGateway,
  ) {}

  /**
   * Récupère la liste des amis acceptés
   */
  async getFriends(userId: string): Promise<any[]> {
    this.logger.log(`📋 [Backend] getFriends pour userId: ${userId}`);

    if (!Types.ObjectId.isValid(userId)) {
      this.logger.warn(`⚠️ ID utilisateur invalide: ${userId}`);
      return [];
    }

    const userObjectId = new Types.ObjectId(userId);

    const friendships = await this.friendModel
      .find({
        $or: [
          { userId: userObjectId },
          { friendId: userObjectId }
        ],
        status: 'accepted',
      })
      .populate('userId', 'firstName lastName email phoneNumber profilePicture isOnline lastSeen')
      .populate('friendId', 'firstName lastName email phoneNumber profilePicture isOnline lastSeen')
      .exec();

    const validFriendships = friendships.filter(f => f.userId && f.friendId);

    const result = validFriendships.map((f) => {
      const user = f.userId as any;
      const friend = f.friendId as any;

      const isCurrentUser = user._id.toString() === userId;
      const friendObj = isCurrentUser ? friend : user;
      const friendId = isCurrentUser ? friend._id.toString() : user._id.toString();
      const currentUserId = isCurrentUser ? user._id.toString() : friend._id.toString();

      return {
        id: f._id.toString(),
        userId: currentUserId,
        friendId: friendId,
        status: f.status,
        friend: {
          id: friendObj._id.toString(),
          firstName: friendObj.firstName,
          lastName: friendObj.lastName,
          email: friendObj.email,
          phoneNumber: friendObj.phoneNumber,
          profilePicture: friendObj.profilePicture,
          isOnline: friendObj.isOnline || false,
          lastSeen: friendObj.lastSeen,
        },
      };
    });

    this.logger.log(`📋 [Backend] ${result.length} amis trouvés`);
    return result;
  }

  /**
   * ✅ Récupère les demandes d'amis reçues par l'utilisateur
   */
  async getFriendRequests(userId: string): Promise<any[]> {
    this.logger.log(`📩 [Backend] getFriendRequests pour userId: ${userId}`);

    if (!Types.ObjectId.isValid(userId)) {
      this.logger.warn(`⚠️ ID utilisateur invalide: ${userId}`);
      return [];
    }

    const userObjectId = new Types.ObjectId(userId);

    // ✅ Récupérer les demandes où l'utilisateur est le DESTINATAIRE (friendId)
    const requests = await this.friendModel
      .find({
        friendId: userObjectId,
        status: 'pending',
      })
      .populate('userId', 'firstName lastName email profilePicture')
      .sort({ createdAt: -1 })
      .exec();

    this.logger.log(`📩 [Backend] ${requests.length} demandes en attente trouvées pour l'utilisateur ${userId}`);

    const result = requests
      .filter(r => r.userId)
      .map((r) => {
        const sender = r.userId as any;
        return {
          id: r._id.toString(),
          senderId: sender._id.toString(),
          receiverId: r.friendId.toString(),
          status: r.status,
          createdAt: r.createdAt,
          sender: {
            id: sender._id.toString(),
            firstName: sender.firstName || 'Utilisateur',
            lastName: sender.lastName || '',
            email: sender.email || '',
            profilePicture: sender.profilePicture || null,
          },
        };
      });

    this.logger.log(`📩 [Backend] ${result.length} demandes formatées`);
    return result;
  }

  /**
   * ✅ Récupère une demande d'ami par son ID
   */
  async getFriendRequestById(requestId: string): Promise<any> {
    this.logger.log(`🔍 [Backend] getFriendRequestById: ${requestId}`);

    if (!Types.ObjectId.isValid(requestId)) {
      this.logger.warn(`⚠️ ID de demande invalide: ${requestId}`);
      return null;
    }

    const request = await this.friendModel
      .findById(requestId)
      .populate('userId', 'firstName lastName email profilePicture')
      .lean();

    if (!request) {
      this.logger.warn(`⚠️ Demande non trouvée: ${requestId}`);
      return null;
    }

    if (!request.userId || (typeof request.userId === 'object' && !(request.userId as any)._id)) {
      this.logger.warn(`⚠️ userId non peuplé pour la demande ${requestId}`);
      return null;
    }

    const sender = request.userId as any;

    this.logger.log(`✅ Demande trouvée: userId=${sender._id}, friendId=${request.friendId}`);

    return {
      id: request._id.toString(),
      senderId: sender._id.toString(),
      receiverId: request.friendId.toString(),
      status: request.status,
      createdAt: request.createdAt,
      sender: {
        id: sender._id.toString(),
        firstName: sender.firstName || 'Utilisateur',
        lastName: sender.lastName || '',
        email: sender.email || '',
        profilePicture: sender.profilePicture || null,
      },
    };
  }

  /**
   * ✅ Envoie une demande d'ami avec notification en temps réel
   */
  async sendFriendRequest(userId: string, friendId: string) {
    this.logger.log(`📤 [Backend] sendFriendRequest: ${userId} -> ${friendId}`);

    if (userId === friendId) {
      throw new BadRequestException('Vous ne pouvez pas vous ajouter vous-même');
    }

    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(friendId)) {
      throw new BadRequestException('ID utilisateur invalide');
    }

    const userObjectId = new Types.ObjectId(userId);
    const friendObjectId = new Types.ObjectId(friendId);

    const userExists = await this.userModel.findById(userObjectId);
    if (!userExists) {
      throw new NotFoundException('Utilisateur expéditeur non trouvé');
    }

    const friendExists = await this.userModel.findById(friendObjectId);
    if (!friendExists) {
      throw new NotFoundException('Utilisateur destinataire non trouvé');
    }

    // Vérifier s'il y a déjà une relation
    let friendship = await this.friendModel.findOne({
      $or: [
        { userId: userObjectId, friendId: friendObjectId },
        { userId: friendObjectId, friendId: userObjectId },
      ],
    });

    if (friendship) {
      this.logger.log(`📤 [Backend] Relation existante: status=${friendship.status}`);

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
        // ✅ FIX : Réactiver la demande en forçant le bon sens
        friendship.userId = userObjectId;
        friendship.friendId = friendObjectId;
        friendship.status = 'pending';
        friendship.deletedBy = undefined;
        friendship.blockedBy = undefined;
        await friendship.save();

        this.logger.log(`✅ [Backend] Demande renvoyée avec sens corrigé: ${friendship._id} (${userId} -> ${friendId})`);

        // Notifier en temps réel
        this.chatGateway?.notifyUser(friendId, 'friendRequest', {
          from: userId,
          requestId: friendship._id,
          sender: {
            id: userId,
            firstName: userExists.firstName || 'Utilisateur',
            lastName: userExists.lastName || '',
            email: userExists.email || '',
            profilePicture: userExists.profilePicture || null,
          }
        });

        this.chatGateway?.notifyUser(userId, 'friendRequestSent', {
          to: friendId,
          requestId: friendship._id,
        });

        return {
          message: 'Demande d\'ami renvoyée',
          success: true,
          requestId: friendship._id,
        };
      }
    }

    // ✅ Créer une nouvelle demande
    friendship = new this.friendModel({
      userId: userObjectId,
      friendId: friendObjectId,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await friendship.save();

    this.logger.log(`✅ [Backend] Nouvelle demande créée: ${friendship._id}`);
    this.logger.log(`✅ [Backend] userId=${friendship.userId}, friendId=${friendship.friendId}, status=${friendship.status}`);

    // Notifier en temps réel le destinataire
    this.chatGateway?.notifyUser(friendId, 'friendRequest', {
      from: userId,
      requestId: friendship._id,
      sender: {
        id: userId,
        firstName: userExists.firstName || 'Utilisateur',
        lastName: userExists.lastName || '',
        email: userExists.email || '',
        profilePicture: userExists.profilePicture || null,
      }
    });

    // Notifier l'expéditeur aussi (pour confirmation)
    this.chatGateway?.notifyUser(userId, 'friendRequestSent', {
      to: friendId,
      requestId: friendship._id,
    });

    return {
      message: 'Demande d\'ami envoyée',
      success: true,
      requestId: friendship._id,
    };
  }

  /**
   * ✅ Accepte une demande d'ami avec notification en temps réel
   */
  async acceptFriendRequest(userId: string, requestId: string) {
    this.logger.log(`✅ [Backend] acceptFriendRequest: ${requestId} par ${userId}`);

    if (!Types.ObjectId.isValid(requestId)) {
      throw new BadRequestException('ID de demande invalide');
    }

    const userObjectId = new Types.ObjectId(userId);

    const request = await this.friendModel.findById(requestId);
    if (!request) {
      this.logger.error(`❌ Demande non trouvée: ${requestId}`);
      throw new NotFoundException('Demande non trouvée');
    }

    this.logger.log(`📌 Demande trouvée: userId=${request.userId}, friendId=${request.friendId}, status=${request.status}`);

    // ✅ Vérifier que l'utilisateur est bien le destinataire
    if (request.friendId.toString() !== userId) {
      this.logger.warn(`❌ Utilisateur ${userId} n'est pas le destinataire de la demande ${requestId}`);
      this.logger.warn(`   Destinataire attendu: ${request.friendId.toString()}`);
      
      // ✅ SI C'EST L'INVERSE (corruption), on corrige automatiquement
      if (request.userId.toString() === userId) {
        this.logger.warn(`🔧 Document corrompu détecté (userId/friendId inversés). Correction...`);
        // Inverser les valeurs
        const tempUserId = request.userId;
        const tempFriendId = request.friendId;
        request.userId = tempFriendId;
        request.friendId = tempUserId;
        await request.save();
        this.logger.log(`✅ Document corrigé: maintenant userId=${request.userId}, friendId=${request.friendId}`);
        
        // Maintenant l'utilisateur est bien le destinataire
        // Continuer l'exécution
      } else {
        throw new ForbiddenException('Non autorisé');
      }
    }

    if (request.status !== 'pending') {
      throw new BadRequestException('Demande déjà traitée');
    }

    // ✅ Accepter la demande
    request.status = 'accepted';
    await request.save();

    // ✅ Ajouter aux listes d'amis
    const senderId = request.userId.toString();
    const receiverId = request.friendId.toString();

    await this.userModel.findByIdAndUpdate(senderId, {
      $addToSet: { friends: receiverId },
    });
    await this.userModel.findByIdAndUpdate(receiverId, {
      $addToSet: { friends: senderId },
    });

    // ✅ Créer une conversation
    let conversation;
    try {
      conversation = await this.conversationsService.createConversation([
        senderId,
        receiverId,
      ]);
    } catch (e) {
      this.logger.error('Erreur création conversation:', e);
    }

    // ✅ Notifier en temps réel l'expéditeur
    const accepter = await this.userModel.findById(userObjectId);
    this.chatGateway?.notifyUser(senderId, 'friendRequestAccepted', {
      by: userId,
      requestId: request._id,
      conversationId: conversation?._id,
      friend: {
        id: userId,
        firstName: accepter?.firstName || 'Utilisateur',
        lastName: accepter?.lastName || '',
      }
    });

    return {
      message: 'Demande d\'ami acceptée',
      conversationId: conversation?._id,
      success: true,
    };
  }

  /**
   * ✅ Refuse une demande d'ami avec notification en temps réel
   */
  async declineFriendRequest(userId: string, requestId: string) {
    this.logger.log(`❌ [Backend] declineFriendRequest: ${requestId} par ${userId}`);

    if (!Types.ObjectId.isValid(requestId)) {
      throw new BadRequestException('ID de demande invalide');
    }

    const request = await this.friendModel.findById(requestId);
    if (!request) {
      throw new NotFoundException('Demande non trouvée');
    }

    // ✅ Vérifier que l'utilisateur est bien le destinataire
    if (request.friendId.toString() !== userId) {
      this.logger.warn(`❌ Utilisateur ${userId} n'est pas le destinataire de la demande ${requestId}`);
      
      // ✅ SI C'EST L'INVERSE (corruption), on corrige automatiquement
      if (request.userId.toString() === userId) {
        this.logger.warn(`🔧 Document corrompu détecté (userId/friendId inversés). Correction...`);
        const tempUserId = request.userId;
        const tempFriendId = request.friendId;
        request.userId = tempFriendId;
        request.friendId = tempUserId;
        await request.save();
        this.logger.log(`✅ Document corrigé: maintenant userId=${request.userId}, friendId=${request.friendId}`);
        // Continuer
      } else {
        throw new ForbiddenException('Non autorisé');
      }
    }

    if (request.status !== 'pending') {
      throw new BadRequestException('Demande déjà traitée');
    }

    // Supprimer la demande
    const senderId = request.userId.toString();
    await request.deleteOne();

    // ✅ Notifier en temps réel l'expéditeur
    this.chatGateway?.notifyUser(senderId, 'friendRequestDeclined', {
      by: userId,
      requestId,
    });

    return {
      message: 'Demande d\'ami refusée',
      success: true,
    };
  }

  async getBlockedUsers(userId: string): Promise<any[]> {
    this.logger.log(`🚫 [Backend] getBlockedUsers pour userId: ${userId}`);

    if (!Types.ObjectId.isValid(userId)) {
      this.logger.warn(`⚠️ ID utilisateur invalide: ${userId}`);
      return [];
    }

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

    const result = blockedRelations
      .filter(f => f.userId && f.friendId)
      .map((f) => {
        const user = f.userId as any;
        const friend = f.friendId as any;
        const isCurrentUser = user._id.toString() === userId;
        const blockedUser = isCurrentUser ? friend : user;

        return {
          id: f._id.toString(),
          userId: isCurrentUser ? user._id.toString() : friend._id.toString(),
          friendId: isCurrentUser ? friend._id.toString() : user._id.toString(),
          status: f.status,
          blockedBy: f.blockedBy?.toString(),
          createdAt: f.createdAt,
          friend: {
            id: blockedUser._id.toString(),
            firstName: blockedUser.firstName,
            lastName: blockedUser.lastName,
            email: blockedUser.email,
            profilePicture: blockedUser.profilePicture,
          },
        };
      });

    this.logger.log(`🚫 [Backend] ${result.length} utilisateurs bloqués trouvés`);
    return result;
  }

  async getSuggestions(userId: string): Promise<any[]> {
    this.logger.log(`💡 [Backend] getSuggestions pour userId: ${userId}`);

    if (!Types.ObjectId.isValid(userId)) {
      this.logger.warn(`⚠️ ID utilisateur invalide: ${userId}`);
      return [];
    }

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

    const result = suggestions.map((s) => ({
      id: s._id.toString(),
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email,
      phoneNumber: s.phoneNumber,
      profilePicture: s.profilePicture,
      isFriend: false,
      hasPendingRequest: false,
      hasIncomingRequest: false,
      isBlocked: false,
    }));

    this.logger.log(`💡 [Backend] ${result.length} suggestions trouvées`);
    return result;
  }

  /**
   * ✅ FIX BUG 2 : distinguer "j'ai envoyé la demande" de "on m'a envoyé une demande"
   */
  async searchUsers(query: string, currentUserId: string): Promise<any[]> {
    this.logger.log(`🔍 [Backend] searchUsers: "${query}" pour userId: ${currentUserId}`);

    if (!Types.ObjectId.isValid(currentUserId)) {
      this.logger.warn(`⚠️ ID utilisateur invalide: ${currentUserId}`);
      return [];
    }

    const currentUserObjectId = new Types.ObjectId(currentUserId);

    const users = await this.userModel
      .find({
        $or: [
          { firstName: { $regex: query, $options: 'i' } },
          { lastName: { $regex: query, $options: 'i' } },
          { email: { $regex: query, $options: 'i' } },
        ],
        _id: { $ne: currentUserObjectId },
      })
      .limit(10)
      .select('firstName lastName email phoneNumber profilePicture')
      .lean();

    const result = await Promise.all(
      users.map(async (user) => {
        const friendship = await this.friendModel.findOne({
          $or: [
            { userId: currentUserObjectId, friendId: user._id },
            { userId: user._id, friendId: currentUserObjectId },
          ],
        });

        const isFriend = friendship?.status === 'accepted';
        const isBlocked = friendship?.status === 'blocked';

        // ✅ direction-aware : qui a envoyé la demande ?
        const iSentRequest =
          friendship?.status === 'pending' &&
          friendship.userId.toString() === currentUserId;

        const theySentRequest =
          friendship?.status === 'pending' &&
          friendship.userId.toString() === user._id.toString();

        return {
          id: user._id.toString(),
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          profilePicture: user.profilePicture,
          isFriend,
          hasPendingRequest: iSentRequest,
          hasIncomingRequest: theySentRequest,
          requestId: theySentRequest ? friendship!._id.toString() : undefined,
          isBlocked,
          blockedBy: friendship?.blockedBy?.toString(),
        };
      }),
    );

    this.logger.log(`🔍 [Backend] ${result.length} utilisateurs trouvés pour "${query}"`);
    return result;
  }

  async findUsersByPhones(phones: string[], currentUserId: string): Promise<any[]> {
    this.logger.log(`📱 [Backend] findUsersByPhones: ${phones.length} numéros pour userId: ${currentUserId}`);

    if (!Types.ObjectId.isValid(currentUserId)) {
      this.logger.warn(`⚠️ ID utilisateur invalide: ${currentUserId}`);
      return [];
    }

    const currentUserObjectId = new Types.ObjectId(currentUserId);
    const cleanPhones = phones.map((p) => p.replace(/\s/g, '').replace(/[^0-9]/g, ''));
    const users = await this.userModel
      .find({
        phoneNumber: { $in: cleanPhones },
        _id: { $ne: currentUserObjectId },
        isActive: true,
      })
      .select('firstName lastName email phoneNumber profilePicture isOnline lastSeen')
      .lean();

    // ✅ Vérifier les relations existantes
    const existingFriends = await this.friendModel.find({
      $or: [{ userId: currentUserObjectId }, { friendId: currentUserObjectId }],
      status: { $in: ['accepted', 'pending', 'blocked'] },
    });
    
    const excludedIds = existingFriends
      .map((f) => {
        const uid = f.userId?.toString();
        const fid = f.friendId?.toString();
        return uid === currentUserId ? fid : uid;
      })
      .filter(id => id) as string[];

    const result = users
      .filter((u) => !excludedIds.includes(u._id.toString()))
      .map((u) => ({
        id: u._id.toString(),
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        profilePicture: u.profilePicture,
        isFriend: false,
        hasPendingRequest: false,
        hasIncomingRequest: false,
        isBlocked: false,
      }));

    this.logger.log(`📱 [Backend] ${result.length} utilisateurs trouvés par téléphone`);
    return result;
  }

  async checkBlockStatus(userId: string, otherUserId: string) {
    this.logger.log(`🔍 [Backend] checkBlockStatus: ${userId} vs ${otherUserId}`);

    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(otherUserId)) {
      this.logger.warn(`⚠️ ID utilisateur invalide`);
      return { isBlocked: false, canMessage: true };
    }

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
    return {
      isBlocked,
      blockedBy: friendship.blockedBy?.toString(),
      canMessage: !isBlocked,
    };
  }

  async removeFriend(userId: string, friendId: string) {
    this.logger.log(`🗑️ [Backend] removeFriend: ${userId} supprime ${friendId}`);

    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(friendId)) {
      throw new BadRequestException('ID utilisateur invalide');
    }

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

  async blockUser(userId: string, userToBlockId: string) {
    this.logger.log(`🚫 [Backend] blockUser: ${userId} bloque ${userToBlockId}`);

    if (userId === userToBlockId) {
      throw new BadRequestException('Vous ne pouvez pas vous bloquer vous-même');
    }

    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(userToBlockId)) {
      throw new BadRequestException('ID utilisateur invalide');
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

  async unblockUser(userId: string, userToUnblockId: string) {
    this.logger.log(`🔓 [Backend] unblockUser: ${userId} débloque ${userToUnblockId}`);

    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(userToUnblockId)) {
      throw new BadRequestException('ID utilisateur invalide');
    }

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

    this.chatGateway?.notifyUser(userToUnblockId, 'userUnblocked', { by: userId });

    return {
      message: 'Utilisateur débloqué',
      success: true,
    };
  }
}