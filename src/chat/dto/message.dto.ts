export class SendMessageDto {
  receiverId: string;
  type: string;
  content?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  emoji?: string;
  moneyTransfer?: {
    amount: number;
  };
}

export class MessageResponseDto {
  id: string;
  senderId: string;
  receiverId: string;
  type: string;
  content?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  emoji?: string;
  isRead: boolean;
  isDelivered: boolean;
  createdAt: Date;
  moneyTransfer?: {
    amount: number;
    status: string;
    transactionId?: string;
  };
  sender?: {
    id: string;
    firstName: string;
    lastName: string;
    profilePicture?: string;
  };
}

export class ConversationResponseDto {
  userId: string;
  firstName: string;
  lastName: string;
  profilePicture?: string;
  lastMessage: any;
  lastMessageTime: Date;
  unreadCount: number;
  isOnline: boolean;
  lastSeen?: Date;
}