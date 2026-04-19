export class UserResponseDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  balance: number;
  qrCode: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  lastLogin?: Date;
}