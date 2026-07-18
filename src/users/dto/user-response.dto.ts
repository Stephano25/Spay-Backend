// src/users/dto/user-response.dto.ts
import { UserRole } from '../schemas/user.schema';

export class UserResponseDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  balance: number;
  qrCode: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  lastLogin?: Date;
  profilePicture?: string;
  bio?: string;
  birthday?: Date;
  gender?: string;
  language: string;
  friends: string[];
  settings?: Record<string, any>;
}