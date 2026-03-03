import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TransactionsModule } from './transactions/transactions.module';
import { ChatModule } from './chat/chat.module';
import { AdminModule } from './admin/admin.module'; // AJOUTER

@Module({
  imports: [
    ConfigModule.forRoot(),
    MongooseModule.forRoot('mongodb://localhost:27017/spaye'),
    AuthModule,
    UsersModule,
    TransactionsModule,
    ChatModule,
    AdminModule, // AJOUTER
  ],
})
export class AppModule {}