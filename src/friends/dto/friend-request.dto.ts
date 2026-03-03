export class FriendRequestDto {
  userId: string;
  friendId: string;
}

export class FriendResponseDto {
  id: string;
  userId: string;
  friendId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  friend?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
    profilePicture?: string;
  };
}