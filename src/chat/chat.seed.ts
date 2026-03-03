import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message } from './schemas/message.schema';
import { User } from '../users/schemas/user.schema';

@Injectable()
export class ChatSeed {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<Message>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  async seed() {
    // Récupérer des utilisateurs
    const users = await this.userModel.find().limit(3);
    
    if (users.length < 2) return;

    // Créer des messages de test
    await this.messageModel.create([
      {
        senderId: users[0]._id,
        receiverId: users[1]._id,
        type: 'text',
        content: 'Salut, comment ça va ?',
        isRead: true,
        isDelivered: true,
      },
      {
        senderId: users[1]._id,
        receiverId: users[0]._id,
        type: 'text',
        content: 'Ça va bien, merci ! Et toi ?',
        isRead: true,
        isDelivered: true,
      },
      {
        senderId: users[0]._id,
        receiverId: users[2]._id,
        type: 'text',
        content: 'Tu peux m\'envoyer 5000 Ar ?',
        isRead: false,
        isDelivered: true,
      },
    ]);

    console.log('Messages de test créés');
  }
}