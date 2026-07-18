// backend/src/transactions/schemas/transaction.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TransactionDocument = Transaction & Document;

export enum TransactionType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  TRANSFER = 'transfer',
  PAYMENT = 'payment',
  MOBILE_MONEY = 'mobile_money',
  RECEIVE = 'receive',
  SEND = 'send',
}

export enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  PROCESSING = 'processing',
}

@Schema({ timestamps: true })
export class Transaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  senderId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  receiverId: Types.ObjectId;

  @Prop({ required: true, enum: TransactionType })
  type: TransactionType;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ default: 0, min: 0 })
  fee: number;

  @Prop({ default: 0, min: 0 })
  totalAmount: number;

  @Prop({ enum: TransactionStatus, default: TransactionStatus.PENDING, index: true })
  status: TransactionStatus;

  @Prop({ default: '' })
  description: string;

  @Prop({ unique: true, sparse: true })
  reference: string;

  @Prop()
  mobileMoneyOperator: string;

  @Prop()
  mobileMoneyNumber: string;

  @Prop()
  paymentMethod: string;

  // ============================================================
  // ✅ COMMISSION SCHEMA - CORRIGÉ
  // ============================================================
  @Prop({
    type: {
      total: { type: Number, default: 0 },
      superAdminCommission: { type: Number, default: 0 },
      adminCommission: { type: Number, default: 0 },
      superAdminId: { type: Types.ObjectId, ref: 'User' },
      adminId: { type: Types.ObjectId, ref: 'User' },
      type: {
        type: String,
        enum: ['user_transfer', 'admin_withdrawal', 'admin_deposit', 'user_deposit'],
      },
      rate: { type: Number, default: 0 },
      breakdown: { type: String, default: '' },
    },
    _id: false,
  })
  commission?: {
    total: number;
    superAdminCommission: number;
    adminCommission: number;
    superAdminId: Types.ObjectId;
    adminId: Types.ObjectId | null;
    type: 'user_transfer' | 'admin_withdrawal' | 'admin_deposit' | 'user_deposit';
    rate: number;
    breakdown: string;
  };

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;

  @Prop({ type: Date, default: Date.now, index: true })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);

// ✅ Index optimisés
TransactionSchema.index({ senderId: 1, createdAt: -1 });
TransactionSchema.index({ receiverId: 1, createdAt: -1 });
TransactionSchema.index({ status: 1, createdAt: -1 });
TransactionSchema.index({ type: 1, createdAt: -1 });
TransactionSchema.index({ 'commission.total': 1 });
TransactionSchema.index({ reference: 1 });

// ✅ DÉSACTIVER strictPopulate SUR LE SCHÉMA
// Cette ligne permet de peupler les chemins qui ne sont pas explicitement définis
// Utilisation de 'any' pour contourner le typage TypeScript
(TransactionSchema as any).set('strictPopulate', false);