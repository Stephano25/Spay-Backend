import { Injectable } from '@nestjs/common';
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

  async validateUser(token: string): Promise<{ id: string; email: string } | null> {
    try {
      const decoded = this.jwtService.verify(token);
      return { id: decoded.sub, email: decoded.email };
    } catch (error) {
      console.error('Erreur validation token:', error);
      return null;
    }
  }

  async saveMessage(messageData: any): Promise<MessageResponseDto> {
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

  async getConversations(userId: string): Promise<any[]> {
    const userObjectId = new Types.ObjectId(userId);

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
      
      const otherUserId = senderId === userId ? receiverId : senderId;
      
      if (processedUsers.has(otherUserId)) continue;
      
      const otherUser = senderId === userId ? message.receiverId : message.senderId;

      if (otherUser) {
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
          isOnline: false,
        });
        
        processedUsers.add(otherUserId);
      }
    }

    return Array.from(conversationMap.values());
  }

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

  async uploadFile(file: Express.Multer.File): Promise<{ url: string; fileName: string; fileSize: number }> {
    const fileUrl = `/uploads/${file.filename}`;
    return {
      url: fileUrl,
      fileName: file.originalname,
      fileSize: file.size,
    };
  }
}