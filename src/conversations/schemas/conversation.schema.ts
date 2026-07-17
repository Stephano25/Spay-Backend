// backend/src/conversations/schemas/conversation.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { Message } from '../../chat/schemas/message.schema';

export type ConversationDocument = Conversation & Document;

@Schema({
  timestamps: true, // ✅ Crée automatiquement createdAt et updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class Conversation {
  @Prop({
    type: [{ type: Types.ObjectId, ref: 'User' }],
    required: true,
  })
  participants: Types.ObjectId[];

  @Prop({
    type: Boolean,
    default: false,
  })
  isGroup: boolean;

  @Prop({
    type: String,
    required: false,
  })
  groupName: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: false,
  })
  admin: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Message',
    required: false,
  })
  lastMessage: Types.ObjectId;

  @Prop({
    type: Date,
    default: Date.now,
  })
  createdAt: Date;

  @Prop({
    type: Date,
    default: Date.now,
  })
  updatedAt: Date;

  // ✅ Virtuals pour les participants peuplés
  participantsData?: any[];
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

// ✅ Index pour les recherches rapides
ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ updatedAt: -1 });