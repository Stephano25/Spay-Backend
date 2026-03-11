import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WalletDocument = Wallet & Document;

@Schema({ timestamps: true })
export class Wallet {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ default: 0 })
  balance: number;

  @Prop({ default: 'Ar' })
  currency: string;

  @Prop({ default: 5000000 })
  dailyLimit: number;

  @Prop({ default: 50000000 })
  monthlyLimit: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  qrCode: string;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);