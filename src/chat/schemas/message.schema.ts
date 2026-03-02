import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

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
  @Prop({ required: true, type: String, ref: 'User' })
  senderId: string;

  @Prop({ required: true, type: String, ref: 'User' })
  receiverId: string;

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

  @Prop()
  emoji: string;

  @Prop({ type: Object })
  moneyTransfer: {
    amount: number;
    status: string;
  };
}

export const MessageSchema = SchemaFactory.createForClass(Message);