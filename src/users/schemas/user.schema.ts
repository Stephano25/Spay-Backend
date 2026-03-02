import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
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

  @Prop()
  profilePicture: string;

  @Prop({ default: 0 })
  balance: number;

  @Prop({ type: String, unique: true })
  qrCode: string;

  @Prop({ type: [{ type: String }] })
  friends: string[];

  @Prop({ default: false })
  isGoogleUser: boolean;

  @Prop()
  googleId: string;
}

export const UserSchema = SchemaFactory.createForClass(User);