import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';
import { Friend, FriendSchema } from './schemas/friend.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ConversationsModule } from '../conversations/conversations.module';
import { ChatModule } from '../chat/chat.module'; // Importer ChatModule pour ChatGateway

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Friend.name, schema: FriendSchema },
      { name: User.name, schema: UserSchema },
    ]),
    forwardRef(() => ConversationsModule), // Utiliser forwardRef pour éviter les dépendances circulaires
    forwardRef(() => ChatModule), // Utiliser forwardRef pour ChatModule
  ],
  controllers: [FriendsController],
  providers: [FriendsService],
  exports: [FriendsService],
})
export class FriendsModule {}