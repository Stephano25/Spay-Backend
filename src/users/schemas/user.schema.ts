import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ unique: true, sparse: true })
  phoneNumber: string;

  @Prop({ default: 0, min: 0 })
  balance: number;

  @Prop({ unique: true, sparse: true })
  qrCode: string;

  @Prop({ default: null })
  profilePicture: string;

  @Prop({ type: [String], default: [] })
  friends: string[];

  @Prop({ default: false })
  isGoogleUser: boolean;

  @Prop()
  googleId: string;

  @Prop({ type: String, enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastLogin: Date;

  @Prop({ default: '' })
  bio: string;

  @Prop({ type: Object, default: {} })
  settings: Record<string, any>;

  createdAt?: Date;
  updatedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ email: 1 });
UserSchema.index({ phoneNumber: 1 });
UserSchema.index({ qrCode: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ isActive: 1 });
UserSchema.index({ firstName: 'text', lastName: 'text' });