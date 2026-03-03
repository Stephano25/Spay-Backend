import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';
import { Message, MessageDocument } from '../messages/schemas/message.schema';

@Injectable()
export class ConversationsService {
  constructor(
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
  ) {}

  /**
   * Créer une nouvelle conversation
   */
  async createConversation(participants: string[]): Promise<ConversationDocument> {
    const participantObjectIds = participants.map(id => new Types.ObjectId(id));
    
    const conversation = new this.conversationModel({
      participants: participantObjectIds,
      lastMessageAt: new Date(),
    });

    return conversation.save();
  }

  /**
   * Envoyer un message dans une conversation
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    content: string,
    type: string = 'text'
  ): Promise<MessageDocument> {
    const conversationObjectId = new Types.ObjectId(conversationId);
    const senderObjectId = new Types.ObjectId(senderId);

    const message = new this.messageModel({
      conversationId: conversationObjectId,
      senderId: senderObjectId,
      content,
      type,
      isRead: false,
      isDelivered: false,
    });

    await message.save();

    // Mettre à jour la conversation
    await this.conversationModel.findByIdAndUpdate(conversationObjectId, {
      lastMessage: message._id,
      lastMessageAt: new Date(),
    });

    return message;
  }

  /**
   * Récupérer les conversations d'un utilisateur
   */
  async getUserConversations(userId: string): Promise<any[]> {
    const userObjectId = new Types.ObjectId(userId);
    
    const conversations = await this.conversationModel
      .find({ participants: userObjectId })
      .populate('participants', 'firstName lastName email profilePicture')
      .populate('lastMessage')
      .sort({ lastMessageAt: -1 })
      .exec();

    return conversations;
  }

  /**
   * Récupérer les messages d'une conversation
   */
  async getConversationMessages(conversationId: string): Promise<MessageDocument[]> {
    const conversationObjectId = new Types.ObjectId(conversationId);
    
    return this.messageModel
      .find({ conversationId: conversationObjectId })
      .populate('senderId', 'firstName lastName profilePicture')
      .sort({ createdAt: 1 })
      .exec();
  }
}