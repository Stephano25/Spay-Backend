import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message, MessageDocument } from './schemas/message.schema';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    private jwtService: JwtService,
  ) {}

  async validateUser(token: string) {
    try {
      const payload = this.jwtService.verify(token);
      return { id: payload.sub, email: payload.email };
    } catch (error) {
      return null;
    }
  }

  async saveMessage(messageData: any) {
    const message = new this.messageModel(messageData);
    await message.save();
    return message;
  }

  async getMessages(userId: string, otherUserId: string) {
    return this.messageModel.find({
      $or: [
        { senderId: userId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: userId },
      ],
    }).sort({ createdAt: 1 });
  }

  async getConversations(userId: string) {
    // Cette fonction devrait retourner les conversations de l'utilisateur
    return this.messageModel.aggregate([
      {
        $match: {
          $or: [{ senderId: userId }, { receiverId: userId }],
        },
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ['$senderId', userId] },
              '$receiverId',
              '$senderId',
            ],
          },
          lastMessage: { $last: '$$ROOT' },
        },
      },
    ]);
  }
}