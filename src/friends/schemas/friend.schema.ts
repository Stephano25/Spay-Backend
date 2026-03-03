import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FriendDocument = Friend & Document;

@Schema({ timestamps: true })
export class Friend {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  friendId: Types.ObjectId;

  @Prop({ enum: ['pending', 'accepted', 'blocked'], default: 'pending' })
  status: string;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const FriendSchema = SchemaFactory.createForClass(Friend);

// Index composé pour garantir l'unicité de la relation
FriendSchema.index({ userId: 1, friendId: 1 }, { unique: true });