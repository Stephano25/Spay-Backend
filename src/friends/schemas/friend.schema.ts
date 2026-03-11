import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FriendDocument = Friend & Document;

@Schema({ timestamps: true })
export class Friend {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  friendId: Types.ObjectId;

  @Prop({ 
    enum: ['pending', 'accepted', 'blocked', 'deleted'], 
    default: 'pending' 
  })
  status: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  blockedBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  deletedBy?: Types.ObjectId;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const FriendSchema = SchemaFactory.createForClass(Friend);
FriendSchema.index({ userId: 1, friendId: 1 }, { unique: true });