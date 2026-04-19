import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
}

@Schema({ timestamps: true }) // Ceci ajoute automatiquement createdAt et updatedAt
export class User {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop()
  password: string;

  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ unique: true, sparse: true })
  phoneNumber: string;

  @Prop({ default: '' })
  profilePicture: string;

  @Prop({ default: 0, min: 0 })
  balance: number;

  @Prop({ unique: true, sparse: true })
  qrCode: string;

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

  // Ces champs sont automatiquement ajoutés par { timestamps: true }
  // mais vous pouvez les déclarer pour TypeScript
  createdAt?: Date;
  updatedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Ajouter des indexes pour améliorer les performances
UserSchema.index({ email: 1 });
UserSchema.index({ phoneNumber: 1 });
UserSchema.index({ qrCode: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ isActive: 1 });