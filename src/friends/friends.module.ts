import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';
import { Friend, FriendSchema } from './schemas/friend.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ConversationsModule } from '../conversations/conversations.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Friend.name, schema: FriendSchema },
      { name: User.name, schema: UserSchema },
    ]),
    forwardRef(() => ConversationsModule),
    forwardRef(() => ChatModule), // Utiliser forwardRef
  ],
  controllers: [FriendsController],
  providers: [FriendsService],
  exports: [FriendsService],
})
export class FriendsModule {}