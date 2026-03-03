import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { Message, MessageSchema } from './schemas/message.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Message.name, schema: MessageSchema },
      { name: User.name, schema: UserSchema }
    ]),
    JwtModule.register({
      secret: 'your-secret-key',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
  exports: [ChatService],
})
export class ChatModule {}