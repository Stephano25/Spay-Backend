import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { Message, MessageDocument } from './schemas/message.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { SendMessageDto, MessageResponseDto } from './dto/message.dto';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
  ) {}

  /**
   * Valider un token JWT
   */
  async validateUser(token: string): Promise<{ id: string; email: string } | null> {
    try {
      const decoded = this.jwtService.verify(token);
      return { id: decoded.sub, email: decoded.email };
    } catch (error) {
      console.error('❌ Erreur validation token:', error);
      return null;
    }
  }

  /**
   * Sauvegarder un message
   */
  async saveMessage(messageData: any): Promise<MessageResponseDto> {
    try {
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
        moneyTransfer: messageData.moneyTransfer ? {
          amount: messageData.moneyTransfer.amount,
          status: 'pending',
        } : undefined,
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
    } catch (error) {
      console.error('❌ Erreur sauvegarde message:', error);
      throw new BadRequestException('Erreur lors de la sauvegarde du message');
    }
  }

  /**
   * Récupérer les conversations d'un utilisateur
   */
  async getConversations(userId: string): Promise<any[]> {
    try {
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
              content: message.content || (message.type === 'emoji' ? message.emoji : ''),
              type: message.type,
              createdAt: message.createdAt,
            },
            lastMessageTime: message.createdAt,
            unreadCount,
            isOnline: false,
          });
          
          processedUsers.add(otherUserId);
        }
      }

      return Array.from(conversationMap.values());
    } catch (error) {
      console.error('❌ Erreur récupération conversations:', error);
      return [];
    }
  }

  /**
   * Récupérer les messages entre deux utilisateurs
   */
  async getMessages(userId: string, otherUserId: string): Promise<MessageResponseDto[]> {
    try {
      if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(otherUserId)) {
        throw new BadRequestException('ID utilisateur invalide');
      }

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
    } catch (error) {
      console.error('❌ Erreur récupération messages:', error);
      throw new BadRequestException('Erreur lors de la récupération des messages');
    }
  }

  /**
   * Envoyer un message
   */
  async sendMessage(senderId: string, sendMessageDto: SendMessageDto): Promise<MessageResponseDto> {
    try {
      if (!Types.ObjectId.isValid(senderId) || !Types.ObjectId.isValid(sendMessageDto.receiverId)) {
        throw new BadRequestException('ID utilisateur invalide');
      }

      const senderObjectId = new Types.ObjectId(senderId);
      const receiverObjectId = new Types.ObjectId(sendMessageDto.receiverId);

      // Vérifier que le destinataire existe
      const receiver = await this.userModel.findById(receiverObjectId);
      if (!receiver) {
        throw new NotFoundException('Destinataire non trouvé');
      }

      const message = new this.messageModel({
        senderId: senderObjectId,
        receiverId: receiverObjectId,
        type: sendMessageDto.type || 'text',
        content: sendMessageDto.content,
        fileUrl: sendMessageDto.fileUrl,
        fileName: sendMessageDto.fileName,
        fileSize: sendMessageDto.fileSize,
        emoji: sendMessageDto.emoji,
        moneyTransfer: sendMessageDto.moneyTransfer ? {
          amount: sendMessageDto.moneyTransfer.amount,
          status: 'pending',
        } : undefined,
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
    } catch (error) {
      console.error('❌ Erreur envoi message:', error);
      throw new BadRequestException('Erreur lors de l\'envoi du message');
    }
  }

  /**
   * Marquer les messages comme lus
   */
  async markAsRead(userId: string, senderId: string): Promise<void> {
    try {
      if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(senderId)) {
        throw new BadRequestException('ID utilisateur invalide');
      }

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
    } catch (error) {
      console.error('❌ Erreur marquage comme lu:', error);
    }
  }

  /**
   * Uploader un fichier
   */
  async uploadFile(file: Express.Multer.File): Promise<{ url: string; fileName: string; fileSize: number }> {
    try {
      const fileUrl = `/uploads/${file.filename}`;
      return {
        url: fileUrl,
        fileName: file.originalname,
        fileSize: file.size,
      };
    } catch (error) {
      console.error('❌ Erreur upload fichier:', error);
      throw new BadRequestException('Erreur lors de l\'upload du fichier');
    }
  }

  /**
   * Supprimer un message (soft delete ou hard delete)
   */
  async deleteMessage(messageId: string, userId: string): Promise<void> {
    try {
      if (!Types.ObjectId.isValid(messageId)) {
        throw new BadRequestException('ID message invalide');
      }

      const message = await this.messageModel.findById(messageId);
      if (!message) {
        throw new NotFoundException('Message non trouvé');
      }

      // Vérifier que l'utilisateur est l'expéditeur
      if (message.senderId.toString() !== userId) {
        throw new BadRequestException('Vous ne pouvez supprimer que vos propres messages');
      }

      // Soft delete : marquer comme supprimé ou hard delete
      await message.deleteOne();
    } catch (error) {
      console.error('❌ Erreur suppression message:', error);
      throw new BadRequestException('Erreur lors de la suppression du message');
    }
  }

  /**
   * Modifier un message
   */
  async updateMessage(messageId: string, userId: string, content: string): Promise<MessageResponseDto> {
    try {
      if (!Types.ObjectId.isValid(messageId)) {
        throw new BadRequestException('ID message invalide');
      }

      const message = await this.messageModel.findById(messageId);
      if (!message) {
        throw new NotFoundException('Message non trouvé');
      }

      // Vérifier que l'utilisateur est l'expéditeur
      if (message.senderId.toString() !== userId) {
        throw new BadRequestException('Vous ne pouvez modifier que vos propres messages');
      }

      // Vérifier que le message est de type texte
      if (message.type !== 'text') {
        throw new BadRequestException('Seuls les messages texte peuvent être modifiés');
      }

      message.content = content;
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
    } catch (error) {
      console.error('❌ Erreur modification message:', error);
      throw new BadRequestException('Erreur lors de la modification du message');
    }
  }
}