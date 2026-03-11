import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TransactionsModule } from './transactions/transactions.module';
import { ChatModule } from './chat/chat.module';
import { FriendsModule } from './friends/friends.module';
import { WalletModule } from './wallet/wallet.module';
import { ConversationsModule } from './conversations/conversations.module'; // AJOUTER L'IMPORT

@Module({
  imports: [
    ConfigModule.forRoot(),
    MongooseModule.forRoot('mongodb://localhost:27017/spaye'),
    AuthModule,
    UsersModule,
    TransactionsModule,
    ChatModule,
    FriendsModule,
    WalletModule,
    ConversationsModule, // AJOUTER DANS LES IMPORTS
  ],
})
export class AppModule {}