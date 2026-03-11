import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message, MessageDocument } from './schemas/message.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { SendMessageDto, MessageResponseDto } from './dto/message.dto';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  /**
   * Valider un utilisateur à partir du token
   */
  async validateUser(token: string): Promise<{ id: string; email: string } | null> {
    try {
      // Cette méthode sera remplacée par la vraie validation JWT
      // Pour l'instant, on retourne un utilisateur fictif pour le test
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      return { id: decoded.sub, email: decoded.email };
    } catch (error) {
      console.error('Erreur validation token:', error);
      return null;
    }
  }

  /**
   * Sauvegarder un message
   */
  async saveMessage(messageData: any): Promise<MessageResponseDto> {
    console.log('Sauvegarde message:', messageData);
    
    const senderObjectId = new Types.ObjectId(messageData.senderId);
    const receiverObjectId = new Types.ObjectId(messageData.receiverId);

    const message = new this.messageModel({
      senderId: senderObjectId,
      receiverId: receiverObjectId,
      type: messageData.type || 'text',
      content: messageData.content,
      fileUrl: messageData.fileUrl,
      fileName: messageData.fileName,
      fileSize: messageData.fileSize,
      emoji: messageData.emoji,
      moneyTransfer: messageData.moneyTransfer,
      isRead: false,
      isDelivered: false,
    });

    await message.save();
    await message.populate('senderId', 'firstName lastName profilePicture');

    const populatedMessage = message as any;
    
    return {
      id: populatedMessage._id.toString(),
      senderId: populatedMessage.senderId._id.toString(),
      receiverId: populatedMessage.receiverId.toString(),
      type: populatedMessage.type,
      content: populatedMessage.content,
      fileUrl: populatedMessage.fileUrl,
      fileName: populatedMessage.fileName,
      fileSize: populatedMessage.fileSize,
      emoji: populatedMessage.emoji,
      isRead: populatedMessage.isRead,
      isDelivered: populatedMessage.isDelivered,
      createdAt: populatedMessage.createdAt,
      moneyTransfer: populatedMessage.moneyTransfer,
      sender: {
        id: populatedMessage.senderId._id.toString(),
        firstName: populatedMessage.senderId.firstName,
        lastName: populatedMessage.senderId.lastName,
        profilePicture: populatedMessage.senderId.profilePicture,
      },
    };
  }

  /**
   * Récupérer les conversations d'un utilisateur
   */
  async getConversations(userId: string): Promise<any[]> {
    const userObjectId = new Types.ObjectId(userId);

    // Récupérer tous les messages où l'utilisateur est impliqué
    const messages = await this.messageModel
      .find({
        $or: [{ senderId: userObjectId }, { receiverId: userObjectId }],
      })
      .sort({ createdAt: -1 })
      .populate('senderId', 'firstName lastName profilePicture')
      .populate('receiverId', 'firstName lastName profilePicture')
      .lean()
      .exec();

    // Grouper par conversation (par utilisateur)
    const conversationMap = new Map<string, any>();
    const processedUsers = new Set<string>();

    for (const message of messages as any[]) {
      const senderId = message.senderId?._id?.toString() || message.senderId?.toString();
      const receiverId = message.receiverId?._id?.toString() || message.receiverId?.toString();
      
      // Déterminer l'autre utilisateur
      const otherUserId = senderId === userId ? receiverId : senderId;
      
      // Éviter les doublons
      if (processedUsers.has(otherUserId)) continue;
      
      // Récupérer les infos de l'autre utilisateur
      const otherUser = senderId === userId ? message.receiverId : message.senderId;

      if (otherUser) {
        // Compter les messages non lus
        const unreadCount = await this.messageModel.countDocuments({
          senderId: new Types.ObjectId(otherUserId),
          receiverId: userObjectId,
          isRead: false,
        });

        conversationMap.set(otherUserId, {
          userId: otherUserId,
          firstName: otherUser.firstName || 'Utilisateur',
          lastName: otherUser.lastName || '',
          profilePicture: otherUser.profilePicture,
          lastMessage: {
            content: message.content,
            type: message.type,
            createdAt: message.createdAt,
          },
          lastMessageTime: message.createdAt,
          unreadCount,
          isOnline: false, // À implémenter avec WebSocket
        });
        
        processedUsers.add(otherUserId);
      }
    }

    return Array.from(conversationMap.values());
  }

  /**
   * Récupérer les messages entre deux utilisateurs
   */
  async getMessages(userId: string, otherUserId: string): Promise<MessageResponseDto[]> {
    const userObjectId = new Types.ObjectId(userId);
    const otherObjectId = new Types.ObjectId(otherUserId);

    const messages = await this.messageModel
      .find({
        $or: [
          { senderId: userObjectId, receiverId: otherObjectId },
          { senderId: otherObjectId, receiverId: userObjectId },
        ],
      })
      .sort({ createdAt: 1 })
      .populate('senderId', 'firstName lastName profilePicture')
      .lean()
      .exec();

    return (messages as any[]).map(msg => ({
      id: msg._id.toString(),
      senderId: msg.senderId?._id?.toString() || msg.senderId?.toString(),
      receiverId: msg.receiverId?.toString(),
      type: msg.type,
      content: msg.content,
      fileUrl: msg.fileUrl,
      fileName: msg.fileName,
      fileSize: msg.fileSize,
      emoji: msg.emoji,
      isRead: msg.isRead,
      isDelivered: msg.isDelivered,
      createdAt: msg.createdAt,
      moneyTransfer: msg.moneyTransfer,
      sender: msg.senderId ? {
        id: msg.senderId._id?.toString() || msg.senderId.toString(),
        firstName: msg.senderId.firstName || 'Utilisateur',
        lastName: msg.senderId.lastName || '',
        profilePicture: msg.senderId.profilePicture,
      } : undefined,
    }));
  }

  /**
   * Envoyer un message
   */
  async sendMessage(senderId: string, sendMessageDto: SendMessageDto): Promise<MessageResponseDto> {
    const senderObjectId = new Types.ObjectId(senderId);
    const receiverObjectId = new Types.ObjectId(sendMessageDto.receiverId);

    const message = new this.messageModel({
      senderId: senderObjectId,
      receiverId: receiverObjectId,
      type: sendMessageDto.type || 'text',
      content: sendMessageDto.content,
      fileUrl: sendMessageDto.fileUrl,
      fileName: sendMessageDto.fileName,
      fileSize: sendMessageDto.fileSize,
      emoji: sendMessageDto.emoji,
      moneyTransfer: sendMessageDto.moneyTransfer,
      isRead: false,
      isDelivered: false,
    });

    await message.save();
    await message.populate('senderId', 'firstName lastName profilePicture');

    const populatedMessage = message as any;

    return {
      id: populatedMessage._id.toString(),
      senderId: populatedMessage.senderId._id.toString(),
      receiverId: populatedMessage.receiverId.toString(),
      type: populatedMessage.type,
      content: populatedMessage.content,
      fileUrl: populatedMessage.fileUrl,
      fileName: populatedMessage.fileName,
      fileSize: populatedMessage.fileSize,
      emoji: populatedMessage.emoji,
      isRead: populatedMessage.isRead,
      isDelivered: populatedMessage.isDelivered,
      createdAt: populatedMessage.createdAt,
      moneyTransfer: populatedMessage.moneyTransfer,
      sender: {
        id: populatedMessage.senderId._id.toString(),
        firstName: populatedMessage.senderId.firstName,
        lastName: populatedMessage.senderId.lastName,
        profilePicture: populatedMessage.senderId.profilePicture,
      },
    };
  }

  /**
   * Marquer les messages comme lus
   */
  async markAsRead(userId: string, senderId: string): Promise<void> {
    const userObjectId = new Types.ObjectId(userId);
    const senderObjectId = new Types.ObjectId(senderId);

    await this.messageModel.updateMany(
      {
        senderId: senderObjectId,
        receiverId: userObjectId,
        isRead: false,
      },
      { isRead: true }
    );
  }

  /**
   * Compter les messages non lus
   */
  async countUnreadMessages(userId: string, senderId: string): Promise<number> {
    const userObjectId = new Types.ObjectId(userId);
    const senderObjectId = new Types.ObjectId(senderId);

    return this.messageModel.countDocuments({
      senderId: senderObjectId,
      receiverId: userObjectId,
      isRead: false,
    });
  }

  /**
   * Uploader un fichier
   */
  async uploadFile(file: Express.Multer.File): Promise<{ url: string; fileName: string; fileSize: number }> {
    const fileUrl = `/uploads/${file.filename}`;
    return {
      url: fileUrl,
      fileName: file.originalname,
      fileSize: file.size,
    };
  }
  
  /**
   * Récupérer les informations d'un utilisateur
   */
  async getUserInfo(userId: string): Promise<{ firstName: string; lastName: string } | null> {
    try {
      const user = await this.userModel
        .findById(new Types.ObjectId(userId))
        .select('firstName lastName')
        .lean()
        .exec();
      
      return user ? { 
        firstName: user.firstName, 
        lastName: user.lastName 
      } : null;
    } catch (error) {
      console.error('Erreur récupération utilisateur:', error);
      return null;
    }
  }
}