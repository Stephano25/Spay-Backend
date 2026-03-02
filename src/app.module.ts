import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TransactionsModule } from './transactions/transactions.module';
import { ChatModule } from './chat/chat.module';
import { MobileMoneyModule } from './mobile-money/mobile-money.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    MongooseModule.forRoot('mongodb://localhost:27017/spaye'),
    AuthModule,
    UsersModule,
    TransactionsModule,
    ChatModule,
    MobileMoneyModule,
  ],
})
export class AppModule {}