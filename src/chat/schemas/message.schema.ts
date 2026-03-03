import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MessageDocument = Message & Document;

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
  VOICE = 'voice',
  VIDEO = 'video',
  EMOJI = 'emoji',
  MONEY = 'money',
}

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  senderId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  receiverId: Types.ObjectId;

  @Prop({ required: true, enum: MessageType })
  type: MessageType;

  @Prop()
  content: string;

  @Prop()
  fileUrl: string;

  @Prop()
  fileName: string;

  @Prop()
  fileSize: number;

  @Prop({ default: false })
  isRead: boolean;

  @Prop({ default: false })
  isDelivered: boolean;

  @Prop()
  emoji: string;

  @Prop({ type: Object })
  moneyTransfer: {
    amount: number;
    status: string;
    transactionId?: string;
  };
}

export const MessageSchema = SchemaFactory.createForClass(Message);