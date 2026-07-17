// backend/src/conversations/conversations.service.ts
import { Injectable, NotFoundException, ForbiddenException, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';
import { Message, MessageDocument } from '../chat/schemas/message.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  // ============================================================
  // CONVERSATIONS
  // ============================================================

  /**
   * ✅ Crée une nouvelle conversation
   */
  async createConversation(participants: string[]): Promise<ConversationDocument> {
    this.logger.log(`📝 Création d'une conversation avec ${participants.length} participants`);
    
    // ✅ Vérifier qu'il y a au moins 2 participants
    if (participants.length < 2) {
      throw new BadRequestException('Une conversation doit avoir au moins 2 participants');
    }

    // ✅ Vérifier si une conversation privée existe déjà
    if (participants.length === 2) {
      const existing = await this.conversationModel.findOne({
        participants: { $all: participants.map(id => new Types.ObjectId(id)) },
        isGroup: false,
      });

      if (existing) {
        this.logger.log(`✅ Conversation existante: ${existing._id}`);
        return existing;
      }
    }

    // ✅ Créer une nouvelle conversation
    const conversation = new this.conversationModel({
      participants: participants.map(id => new Types.ObjectId(id)),
      isGroup: participants.length > 2,
    });

    await conversation.save();
    this.logger.log(`✅ Conversation créée: ${conversation._id}`);
    return conversation;
  }

  /**
   * ✅ Récupère une conversation par ID avec vérification des droits
   */
  async getConversationById(conversationId: string, userId: string): Promise<ConversationDocument> {
    this.logger.log(`🔍 Récupération de la conversation ${conversationId} pour ${userId}`);
    
    const conversation = await this.conversationModel
      .findById(conversationId)
      .populate('participants', 'firstName lastName email profilePicture isOnline lastSeen')
      .populate('lastMessage')
      .exec();

    if (!conversation) {
      throw new NotFoundException('Conversation non trouvée');
    }

    // ✅ Vérifier que l'utilisateur est participant
    const isParticipant = conversation.participants.some(
      (p: any) => p._id?.toString() === userId || p.toString() === userId
    );

    if (!isParticipant) {
      throw new ForbiddenException('Vous n\'êtes pas autorisé à voir cette conversation');
    }

    return conversation;
  }

  /**
   * ✅ Récupère toutes les conversations d'un utilisateur
   */
  async getUserConversations(userId: string): Promise<any[]> {
    this.logger.log(`📋 Récupération des conversations pour ${userId}`);
    
    const conversations = await this.conversationModel
      .find({
        participants: { $in: [new Types.ObjectId(userId)] },
      })
      .populate('participants', 'firstName lastName email profilePicture isOnline lastSeen')
      .populate('lastMessage')
      .sort({ updatedAt: -1 })
      .exec();

    // ✅ Transformer les données pour le frontend
    return conversations.map(conv => {
      const convObj = conv.toObject();
      const otherParticipants = convObj.participants.filter(
        (p: any) => p._id.toString() !== userId
      );
      
      return {
        id: convObj._id.toString(),
        isGroup: convObj.isGroup || false,
        groupName: convObj.groupName || null,
        participants: convObj.participants,
        lastMessage: convObj.lastMessage || null,
        updatedAt: convObj.updatedAt,
        createdAt: convObj.createdAt,
        otherParticipant: otherParticipants.length === 1 ? otherParticipants[0] : null,
      };
    });
  }

  /**
   * ✅ Récupère ou crée une conversation privée entre deux utilisateurs
   */
  async getOrCreatePrivateConversation(userId1: string, userId2: string): Promise<ConversationDocument> {
    this.logger.log(`🔍 Recherche d'une conversation entre ${userId1} et ${userId2}`);
    
    if (userId1 === userId2) {
      throw new BadRequestException('Impossible de créer une conversation avec soi-même');
    }
    
    const existing = await this.conversationModel.findOne({
      participants: { $all: [new Types.ObjectId(userId1), new Types.ObjectId(userId2)] },
      isGroup: false,
    });

    if (existing) {
      return existing;
    }

    return this.createConversation([userId1, userId2]);
  }

  /**
   * ✅ Crée une conversation de groupe
   */
  async createGroupConversation(
    participants: string[],
    groupName: string,
    adminId: string,
  ): Promise<ConversationDocument> {
    this.logger.log(`📝 Création d'un groupe "${groupName}" avec ${participants.length} participants`);
    
    if (!groupName || groupName.trim().length === 0) {
      throw new BadRequestException('Le nom du groupe est requis');
    }

    if (participants.length < 3) {
      throw new BadRequestException('Un groupe doit avoir au moins 3 participants');
    }

    // ✅ S'assurer que l'admin est dans les participants
    if (!participants.includes(adminId)) {
      participants.push(adminId);
    }

    const conversation = new this.conversationModel({
      participants: participants.map(id => new Types.ObjectId(id)),
      isGroup: true,
      groupName: groupName.trim(),
      admin: new Types.ObjectId(adminId),
    });

    await conversation.save();
    this.logger.log(`✅ Groupe créé: ${conversation._id}`);
    return conversation;
  }

  /**
   * ✅ Ajoute un participant à une conversation
   */
  async addParticipant(conversationId: string, userId: string): Promise<ConversationDocument> {
    const conversation = await this.conversationModel.findById(conversationId);
    if (!conversation) {
      throw new NotFoundException('Conversation non trouvée');
    }

    const userIdObj = new Types.ObjectId(userId);
    if (!conversation.participants.some((p: any) => p.toString() === userIdObj.toString())) {
      conversation.participants.push(userIdObj);
      conversation.updatedAt = new Date();
      await conversation.save();
      this.logger.log(`✅ Utilisateur ${userId} ajouté à la conversation ${conversationId}`);
    }

    return conversation;
  }

  /**
   * ✅ Retire un participant d'une conversation
   */
  async removeParticipant(conversationId: string, userId: string): Promise<ConversationDocument> {
    const conversation = await this.conversationModel.findById(conversationId);
    if (!conversation) {
      throw new NotFoundException('Conversation non trouvée');
    }

    const userIdObj = new Types.ObjectId(userId);
    conversation.participants = conversation.participants.filter(
      (p: any) => p.toString() !== userIdObj.toString()
    );
    conversation.updatedAt = new Date();
    await conversation.save();

    this.logger.log(`✅ Utilisateur ${userId} retiré de la conversation ${conversationId}`);
    return conversation;
  }

  /**
   * ✅ Met à jour le dernier message d'une conversation
   */
  async updateLastMessage(conversationId: string, messageId: string): Promise<void> {
    await this.conversationModel.findByIdAndUpdate(conversationId, {
      lastMessage: new Types.ObjectId(messageId),
      updatedAt: new Date(),
    });
    this.logger.log(`✅ Dernier message mis à jour pour la conversation ${conversationId}`);
  }

  // ============================================================
  // MESSAGES
  // ============================================================

  /**
   * ✅ Récupère les messages d'une conversation
   */
  async getConversationMessages(conversationId: string): Promise<MessageDocument[]> {
    this.logger.log(`📩 Récupération des messages pour la conversation ${conversationId}`);
    
    const messages = await this.messageModel
      .find({ conversationId: new Types.ObjectId(conversationId) })
      .populate('senderId', 'firstName lastName email profilePicture')
      .sort({ createdAt: 1 })
      .exec();

    return messages;
  }

  /**
   * ✅ Envoie un message dans une conversation
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    content: string,
    type: string = 'text',
  ): Promise<MessageDocument> {
    this.logger.log(`📤 Envoi d'un message de ${senderId} dans ${conversationId}`);
    
    // ✅ Vérifier que la conversation existe
    const conversation = await this.conversationModel.findById(conversationId);
    if (!conversation) {
      throw new NotFoundException('Conversation non trouvée');
    }

    // ✅ Vérifier que l'utilisateur est participant
    const isParticipant = conversation.participants.some(
      (p: any) => p.toString() === senderId
    );
    if (!isParticipant) {
      throw new ForbiddenException('Vous n\'êtes pas autorisé à envoyer un message dans cette conversation');
    }

    // ✅ Créer le message
    const message = new this.messageModel({
      conversationId: new Types.ObjectId(conversationId),
      senderId: new Types.ObjectId(senderId),
      content,
      type,
      isRead: false,
    });

    await message.save();

    // ✅ Mettre à jour le dernier message de la conversation
    await this.updateLastMessage(conversationId, message._id.toString());

    // ✅ Populer le sender pour la réponse
    await message.populate('senderId', 'firstName lastName email profilePicture');

    this.logger.log(`✅ Message envoyé: ${message._id}`);
    return message;
  }

  /**
   * ✅ Marque des messages comme lus
   */
  async markMessagesAsRead(conversationId: string, userId: string): Promise<void> {
    this.logger.log(`📖 Marquage des messages comme lus dans ${conversationId} pour ${userId}`);
    
    await this.messageModel.updateMany(
      {
        conversationId: new Types.ObjectId(conversationId),
        senderId: { $ne: new Types.ObjectId(userId) },
        isRead: false,
      },
      { isRead: true }
    );
  }

  /**
   * ✅ Compte les messages non lus pour un utilisateur
   */
  async countUnreadMessages(userId: string): Promise<number> {
    const conversations = await this.conversationModel.find({
      participants: { $in: [new Types.ObjectId(userId)] }
    });

    let totalUnread = 0;
    for (const conv of conversations) {
      const count = await this.messageModel.countDocuments({
        conversationId: conv._id,
        senderId: { $ne: new Types.ObjectId(userId) },
        isRead: false,
      });
      totalUnread += count;
    }

    return totalUnread;
  }

  /**
   * ✅ Récupère les messages non lus pour un utilisateur par conversation
   */
  async getUnreadMessagesByConversation(userId: string): Promise<any[]> {
    const conversations = await this.conversationModel.find({
      participants: { $in: [new Types.ObjectId(userId)] }
    });

    const result = [];
    for (const conv of conversations) {
      const unreadMessages = await this.messageModel.find({
        conversationId: conv._id,
        senderId: { $ne: new Types.ObjectId(userId) },
        isRead: false,
      }).populate('senderId', 'firstName lastName email profilePicture');

      if (unreadMessages.length > 0) {
        result.push({
          conversationId: conv._id.toString(),
          count: unreadMessages.length,
          messages: unreadMessages,
        });
      }
    }

    return result;
  }
}