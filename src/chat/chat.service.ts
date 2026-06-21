// backend/src/chat/chat.service.ts
import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { Message, MessageDocument } from './schemas/message.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { SendMessageDto, MessageResponseDto } from './dto/message.dto';
import { TransactionsService } from '../transactions/transactions.service';
import { ChatGateway } from './chat.gateway';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private transactionsService: TransactionsService,
    @Inject(forwardRef(() => ChatGateway)) private chatGateway: ChatGateway,
  ) {}

  async saveMessage(messageData: any): Promise<MessageResponseDto> {
    try {
      const senderObjectId = new Types.ObjectId(messageData.senderId);
      const receiverObjectId = new Types.ObjectId(messageData.receiverId);

      let moneyTransfer: any = undefined;

      if (messageData.type === 'money' && messageData.moneyTransfer?.amount) {
        moneyTransfer = await this.processMoneyTransfer(
          messageData.senderId,
          messageData.receiverId,
          messageData.moneyTransfer.amount,
        );
      }

      const message = new this.messageModel({
        senderId: senderObjectId,
        receiverId: receiverObjectId,
        type: messageData.type || 'text',
        content: messageData.content,
        fileUrl: messageData.fileUrl,
        fileName: messageData.fileName,
        fileSize: messageData.fileSize,
        emoji: messageData.emoji,
        moneyTransfer,
        isRead: false,
        isDelivered: false,
      });

      await message.save();
      await message.populate('senderId', 'firstName lastName profilePicture');

      return this.toResponseDto(message);
    } catch (error) {
      throw new BadRequestException('Erreur lors de la sauvegarde du message');
    }
  }

  private async processMoneyTransfer(senderId: string, receiverId: string, amount: number) {
    try {
      if (senderId === receiverId) {
        throw new Error("Vous ne pouvez pas vous envoyer de l'argent à vous-même");
      }
      if (!amount || amount <= 0) {
        throw new Error('Montant invalide');
      }

      const transaction: any = await this.transactionsService.sendMoney(senderId, {
        receiverId,
        amount,
        description: 'Transfert via messagerie',
      });

      return {
        amount,
        status: 'completed',
        transactionId: transaction?._id?.toString() || transaction?.id,
      };
    } catch (error: any) {
      return {
        amount,
        status: 'failed',
        failReason: error?.message || 'Erreur lors du transfert',
      };
    }
  }

  async getConversations(userId: string): Promise<any[]> {
    const userObjectId = new Types.ObjectId(userId);

    const conversations = await this.messageModel.aggregate([
      {
        $match: {
          $or: [{ senderId: userObjectId }, { receiverId: userObjectId }],
          isDeleted: { $ne: true },
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            $cond: [{ $eq: ['$senderId', userObjectId] }, '$receiverId', '$senderId'],
          },
          lastMessage: { $first: '$$ROOT' },
          allMessages: { $push: '$$ROOT' },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'otherUser',
        },
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
                    { $eq: ['$$msg.isRead', false] },
                    { $ne: ['$$msg.isDeleted', true] },
                  ],
                },
              },
            },
          },
          isOnline: { $ifNull: ['$otherUser.isOnline', false] },
        },
      },
      {
        $project: {
          userId: '$_id',
          firstName: '$otherUser.firstName',
          lastName: '$otherUser.lastName',
          profilePicture: '$otherUser.profilePicture',
          lastMessage: {
            content: {
              $cond: [
                '$lastMessage.isDeleted',
                'Message supprimé',
                { $ifNull: ['$lastMessage.content', ''] },
              ],
            },
            type: '$lastMessage.type',
            createdAt: '$lastMessage.createdAt',
          },
          lastMessageTime: '$lastMessage.createdAt',
          unreadCount: 1,
          isOnline: 1,
        },
      },
      { $sort: { lastMessageTime: -1 } },
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
      .exec();

    return messages.map((msg) => this.toResponseDto(msg));
  }

  async getMessagesPaginated(
    userId: string,
    otherUserId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<MessageResponseDto[]> {
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
      .exec();

    return messages.reverse().map((msg) => this.toResponseDto(msg));
  }

  async markAsRead(userId: string, senderId: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(senderId)) return;

    await this.messageModel.updateMany(
      {
        senderId: new Types.ObjectId(senderId),
        receiverId: new Types.ObjectId(userId),
        isRead: false,
      },
      { isRead: true },
    );
  }

  async sendMessage(senderId: string, sendMessageDto: SendMessageDto): Promise<MessageResponseDto> {
    return this.saveMessage({ ...sendMessageDto, senderId });
  }

  async uploadFile(file: Express.Multer.File): Promise<{ url: string; fileName: string; fileSize: number }> {
    return {
      url: `/uploads/${file.filename}`,
      fileName: file.originalname,
      fileSize: file.size,
    };
  }

  async deleteMessage(messageId: string, userId: string): Promise<MessageResponseDto> {
    const message = await this.messageModel.findById(messageId);
    if (!message) throw new NotFoundException('Message non trouvé');
    if (message.senderId.toString() !== userId) {
      throw new BadRequestException('Vous ne pouvez supprimer que vos propres messages');
    }

    message.isDeleted = true;
    message.deletedAt = new Date();
    message.content = '';
    message.fileUrl = undefined as any;
    await message.save();
    await message.populate('senderId', 'firstName lastName profilePicture');

    const dto = this.toResponseDto(message);
    this.chatGateway?.notifyUser(message.receiverId.toString(), 'messageDeleted', { messageId });
    return dto;
  }

  async updateMessage(messageId: string, userId: string, content: string): Promise<MessageResponseDto> {
    const message = await this.messageModel.findById(messageId);
    if (!message) throw new NotFoundException('Message non trouvé');
    if (message.senderId.toString() !== userId) {
      throw new BadRequestException('Vous ne pouvez modifier que vos propres messages');
    }
    if (message.type !== 'text') {
      throw new BadRequestException('Seuls les messages texte peuvent être modifiés');
    }
    if (message.isDeleted) {
      throw new BadRequestException('Ce message a été supprimé');
    }
    if (!content || !content.trim()) {
      throw new BadRequestException('Le message ne peut pas être vide');
    }

    message.content = content.trim();
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();
    await message.populate('senderId', 'firstName lastName profilePicture');

    const dto = this.toResponseDto(message);
    this.chatGateway?.notifyUser(message.receiverId.toString(), 'messageEdited', dto);
    return dto;
  }

  async reactToMessage(messageId: string, userId: string, emoji: string): Promise<MessageResponseDto> {
    if (!emoji) throw new BadRequestException('Emoji requis');

    const message = await this.messageModel.findById(messageId);
    if (!message) throw new NotFoundException('Message non trouvé');

    const userObjectId = new Types.ObjectId(userId);
    message.reactions = (message.reactions || []).filter((r) => r.userId.toString() !== userId);
    message.reactions.push({ userId: userObjectId, emoji });
    await message.save();
    await message.populate('senderId', 'firstName lastName profilePicture');

    const dto = this.toResponseDto(message);
    const otherUserId =
      message.senderId.toString() === userId ? message.receiverId.toString() : message.senderId.toString();
    this.chatGateway?.notifyUser(otherUserId, 'messageReaction', dto);
    return dto;
  }

  async removeReaction(messageId: string, userId: string): Promise<MessageResponseDto> {
    const message = await this.messageModel.findById(messageId);
    if (!message) throw new NotFoundException('Message non trouvé');

    message.reactions = (message.reactions || []).filter((r) => r.userId.toString() !== userId);
    await message.save();
    await message.populate('senderId', 'firstName lastName profilePicture');

    const dto = this.toResponseDto(message);
    const otherUserId =
      message.senderId.toString() === userId ? message.receiverId.toString() : message.senderId.toString();
    this.chatGateway?.notifyUser(otherUserId, 'messageReaction', dto);
    return dto;
  }

  private toResponseDto(message: any): MessageResponseDto {
    const senderPopulated = message.senderId && message.senderId.firstName !== undefined;

    return {
      id: message._id.toString(),
      senderId: senderPopulated ? message.senderId._id.toString() : message.senderId.toString(),
      receiverId: message.receiverId.toString(),
      type: message.type,
      content: message.isDeleted ? '' : message.content,
      fileUrl: message.isDeleted ? undefined : message.fileUrl,
      fileName: message.fileName,
      fileSize: message.fileSize,
      emoji: message.emoji,
      isRead: message.isRead,
      isDelivered: message.isDelivered,
      isEdited: message.isEdited,
      editedAt: message.editedAt,
      isDeleted: message.isDeleted,
      createdAt: message.createdAt,
      moneyTransfer: message.moneyTransfer,
      reactions: (message.reactions || []).map((r: any) => ({
        userId: r.userId.toString(),
        emoji: r.emoji,
      })),
      sender: senderPopulated
        ? {
            id: message.senderId._id.toString(),
            firstName: message.senderId.firstName,
            lastName: message.senderId.lastName,
            profilePicture: message.senderId.profilePicture,
          }
        : undefined,
    };
  }
}