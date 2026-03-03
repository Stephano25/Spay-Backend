import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';
import { Friend, FriendSchema } from './schemas/friend.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Friend.name, schema: FriendSchema },
      { name: User.name, schema: UserSchema }
    ]),
  ],
  controllers: [FriendsController],
  providers: [FriendsService],
  exports: [FriendsService],
})
export class FriendsModule {}