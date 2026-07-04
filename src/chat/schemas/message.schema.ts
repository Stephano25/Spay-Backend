import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MessageDocument = Message & Document;

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
  EMOJI = 'emoji',
  MONEY = 'money',
}

export interface MessageReaction {
  userId: Types.ObjectId;
  emoji: string;
}

export interface MoneyTransferInfo {
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  transactionId?: string;
  failReason?: string;
}

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  senderId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  receiverId: Types.ObjectId;

  @Prop({ required: true, enum: MessageType, default: MessageType.TEXT })
  type: string;

  @Prop()
  content: string;

  @Prop()
  fileUrl: string;

  @Prop()
  fileName: string;

  @Prop()
  fileSize: number;

  @Prop()
  emoji: string;

  @Prop({ default: false })
  isRead: boolean;

  @Prop({ default: false })
  isDelivered: boolean;

  @Prop({ default: false })
  isEdited: boolean;

  @Prop()
  editedAt: Date;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt: Date;

  @Prop({
    type: [{ userId: { type: Types.ObjectId, ref: 'User' }, emoji: String }],
    default: [],
  })
  reactions: MessageReaction[];

  @Prop({ type: Object })
  moneyTransfer: MoneyTransferInfo;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });