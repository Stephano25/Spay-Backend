import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TransactionDocument = Transaction & Document;

export enum TransactionType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  TRANSFER = 'transfer',
  PAYMENT = 'payment',
  MOBILE_MONEY = 'mobile_money',
}

export enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Schema({ timestamps: true })
export class Transaction {
  @Prop({ required: true, type: String, ref: 'User' })
  senderId: string;

  @Prop({ type: String, ref: 'User' })
  receiverId: string;

  @Prop({ required: true, enum: TransactionType })
  type: TransactionType;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ enum: TransactionStatus, default: TransactionStatus.PENDING })
  status: TransactionStatus;

  @Prop()
  description: string;

  @Prop()
  mobileMoneyOperator: string;

  @Prop()
  mobileMoneyNumber: string;

  @Prop({ type: Object })
  metadata: Record<string, any>;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);