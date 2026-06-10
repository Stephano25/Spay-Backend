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

  async saveMessage(messageData: any): Promise<MessageResponseDto> {
    try {
      const senderObjectId = new Types.ObjectId(messageData.senderId);
      const receiverObjectId = new Types.ObjectId(messageData.receiverId);
      const message = new this.messageModel({
        senderId: senderObjectId, receiverId: receiverObjectId, type: messageData.type || 'text',
        content: messageData.content, fileUrl: messageData.fileUrl, fileName: messageData.fileName,
        fileSize: messageData.fileSize, emoji: messageData.emoji,
        moneyTransfer: messageData.moneyTransfer ? { amount: messageData.moneyTransfer.amount, status: 'pending' } : undefined,
        isRead: false, isDelivered: false,
      });
      await message.save();
      await message.populate('senderId', 'firstName lastName profilePicture');
      const populated = message as any;
      return {
        id: populated._id.toString(), senderId: populated.senderId._id.toString(), receiverId: populated.receiverId.toString(),
        type: populated.type, content: populated.content, fileUrl: populated.fileUrl, fileName: populated.fileName,
        fileSize: populated.fileSize, emoji: populated.emoji, isRead: populated.isRead, isDelivered: populated.isDelivered,
        createdAt: populated.createdAt, moneyTransfer: populated.moneyTransfer,
        sender: { id: populated.senderId._id.toString(), firstName: populated.senderId.firstName, lastName: populated.senderId.lastName, profilePicture: populated.senderId.profilePicture },
      };
    } catch (error) {
      throw new BadRequestException('Erreur lors de la sauvegarde du message');
    }
  }

  // ✅ Version corrigée - agrégation MongoDB standard sans $function
  async getConversations(userId: string): Promise<any[]> {
    const userObjectId = new Types.ObjectId(userId);

    const conversations = await this.messageModel.aggregate([
      {
        $match: {
          $or: [{ senderId: userObjectId }, { receiverId: userObjectId }]
        }
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            $cond: [{ $eq: ['$senderId', userObjectId] }, '$receiverId', '$senderId']
          },
          lastMessage: { $first: '$$ROOT' },
          allMessages: { $push: '$$ROOT' } // collection de tous les messages du groupe
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'otherUser'
        }
      },
      { $unwind: '$otherUser' },
      {
        $addFields: {
          unreadCount: {
            $size: {
              $filter: {
                input: '$allMessages',
                as: 'msg',
                cond: {
                  $and: [
                    { $eq: ['$$msg.receiverId', userObjectId] },
                    { $eq: ['$$msg.isRead', false] }
                  ]
                }
              }
            }
          }
        }
      },
      {
        $project: {
          userId: '$_id',
          firstName: '$otherUser.firstName',
          lastName: '$otherUser.lastName',
          profilePicture: '$otherUser.profilePicture',
          lastMessage: {
            content: { $ifNull: ['$lastMessage.content', ''] },
            type: '$lastMessage.type',
            createdAt: '$lastMessage.createdAt'
          },
          lastMessageTime: '$lastMessage.createdAt',
          unreadCount: 1
        }
      },
      { $sort: { lastMessageTime: -1 } }
    ]);

    return conversations;
  }

  async getMessages(userId: string, otherUserId: string): Promise<MessageResponseDto[]> {
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
  }

  async getMessagesPaginated(userId: string, otherUserId: string, page: number = 1, limit: number = 20): Promise<MessageResponseDto[]> {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(otherUserId)) {
      throw new BadRequestException('ID utilisateur invalide');
    }
    const userObjectId = new Types.ObjectId(userId);
    const otherObjectId = new Types.ObjectId(otherUserId);
    const skip = (page - 1) * limit;

    const messages = await this.messageModel
      .find({
        $or: [
          { senderId: userObjectId, receiverId: otherObjectId },
          { senderId: otherObjectId, receiverId: userObjectId },
        ],
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('senderId', 'firstName lastName profilePicture')
      .lean()
      .exec();

    // Retourner dans l'ordre chronologique croissant pour l'affichage
    return (messages as any[]).reverse().map(msg => ({
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

  async markAsRead(userId: string, senderId: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(senderId)) return;
    await this.messageModel.updateMany(
      { senderId: new Types.ObjectId(senderId), receiverId: new Types.ObjectId(userId), isRead: false },
      { isRead: true }
    );
  }

  async sendMessage(senderId: string, sendMessageDto: SendMessageDto): Promise<MessageResponseDto> {
    return this.saveMessage({ ...sendMessageDto, senderId });
  }

  async uploadFile(file: Express.Multer.File): Promise<{ url: string; fileName: string; fileSize: number }> {
    return { url: `/uploads/${file.filename}`, fileName: file.originalname, fileSize: file.size };
  }

  async deleteMessage(messageId: string, userId: string): Promise<void> {
    const message = await this.messageModel.findById(messageId);
    if (!message) throw new NotFoundException('Message non trouvé');
    if (message.senderId.toString() !== userId) throw new BadRequestException('Vous ne pouvez supprimer que vos propres messages');
    await message.deleteOne();
  }

  async updateMessage(messageId: string, userId: string, content: string): Promise<MessageResponseDto> {
    const message = await this.messageModel.findById(messageId);
    if (!message) throw new NotFoundException('Message non trouvé');
    if (message.senderId.toString() !== userId) throw new BadRequestException('Vous ne pouvez modifier que vos propres messages');
    if (message.type !== 'text') throw new BadRequestException('Seuls les messages texte peuvent être modifiés');
    message.content = content;
    await message.save();
    await message.populate('senderId', 'firstName lastName profilePicture');
    const populated = message as any;
    return {
      id: populated._id.toString(),
      senderId: populated.senderId._id.toString(),
      receiverId: populated.receiverId.toString(),
      type: populated.type,
      content: populated.content,
      fileUrl: populated.fileUrl,
      fileName: populated.fileName,
      fileSize: populated.fileSize,
      emoji: populated.emoji,
      isRead: populated.isRead,
      isDelivered: populated.isDelivered,
      createdAt: populated.createdAt,
      moneyTransfer: populated.moneyTransfer,
      sender: {
        id: populated.senderId._id.toString(),
        firstName: populated.senderId.firstName,
        lastName: populated.senderId.lastName,
        profilePicture: populated.senderId.profilePicture,
      },
    };
  }
}