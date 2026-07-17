// backend/src/chat/dto/message.dto.ts
export class SendMessageDto {
  receiverId: string;
  type: string;
  content?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string; // ✅ Ajouté
  emoji?: string;
  moneyTransfer?: {
    amount: number;
  };
}

export class ReactToMessageDto {
  emoji: string;
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
  mimeType?: string; // ✅ Ajouté
  emoji?: string;
  isRead: boolean;
  isDelivered: boolean;
  isEdited?: boolean;
  editedAt?: Date;
  isDeleted?: boolean;
  createdAt: Date;
  duration?: number; // ✅ Ajouté pour les vidéos et audios
  thumbnail?: string; // ✅ Ajouté pour les miniatures vidéo
  moneyTransfer?: {
    amount: number;
    status: string;
    transactionId?: string;
    failReason?: string;
  };
  reactions?: { userId: string; emoji: string }[];
  sender?: {
    id: string;
    firstName: string;
    lastName: string;
    profilePicture?: string;
  };
}