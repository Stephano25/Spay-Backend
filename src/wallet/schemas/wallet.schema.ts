import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WalletDocument = Wallet & Document;

@Schema({ timestamps: true })
export class Wallet {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ required: true, default: 0, min: 0 })
  balance: number;

  @Prop({ default: 0, min: 0 })
  totalReceived: number;

  @Prop({ default: 0, min: 0 })
  totalSent: number;

  @Prop({ default: 0, min: 0 })
  totalFees: number;

  @Prop({ default: 0, min: 0 })
  pendingBalance: number;

  @Prop({ default: 'Ar' })
  currency: string;

  @Prop({ default: 5000000 })
  dailyLimit: number;

  @Prop({ default: 50000000 })
  monthlyLimit: number;

  @Prop({ default: 0 })
  todaySpent: number;

  @Prop({ default: 0 })
  monthSpent: number;

  @Prop({ type: Date, default: Date.now })
  lastResetDate: Date;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  qrCode: string;

  @Prop({ type: Object, default: {} })
  settings: {
    autoSave: boolean;
    notificationThreshold: number;
  };
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);

// Index pour les performances
WalletSchema.index({ userId: 1 });
WalletSchema.index({ balance: -1 });