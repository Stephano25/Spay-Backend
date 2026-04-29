import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Inject, forwardRef } from '@nestjs/common';
import { ChatService } from './chat.service';
import { FriendsService } from '../friends/friends.service';

@WebSocketGateway({ 
  cors: { 
    origin: ['http://localhost:4200', 'http://localhost:3000'], 
    credentials: true 
  } 
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;
  private connectedUsers: Map<string, string> = new Map();

  constructor(
    private chatService: ChatService,
    @Inject(forwardRef(() => FriendsService)) 
    private friendsService: FriendsService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token;
      if (!token) {
        client.disconnect();
        return;
      }
      const user = await this.chatService.validateUser(token);
      if (user?.id) {
        this.connectedUsers.set(user.id, client.id);
        client.data.userId = user.id;
        client.join(`user_${user.id}`);
        this.server.emit('userOnline', { userId: user.id, isOnline: true });
        client.emit('onlineUsers', Array.from(this.connectedUsers.keys()));
      } else {
        client.disconnect();
      }
    } catch (error) {
      console.error('Connection error:', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    if (userId) {
      this.connectedUsers.delete(userId);
      this.server.emit('userOnline', { userId, isOnline: false });
    }
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    const senderId = client.data?.userId;
    if (!senderId) {
      client.emit('error', { message: 'Non authentifié' });
      return;
    }

    const canSend = await this.canSendMessage(senderId, data.receiverId);
    if (!canSend) {
      client.emit('messageBlocked', { receiverId: data.receiverId, reason: 'Bloqué' });
      return;
    }

    try {
      const message = await this.chatService.saveMessage({ ...data, senderId });
      const receiverSocketId = this.connectedUsers.get(data.receiverId);
      if (receiverSocketId) {
        this.server.to(receiverSocketId).emit('newMessage', message);
      }
      client.emit('messageSent', message);
    } catch (error) {
      console.error('Send message error:', error);
      client.emit('error', { message: 'Erreur envoi' });
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(@ConnectedSocket() client: Socket, @MessageBody() data: { receiverId: string; isTyping: boolean }) {
    const senderId = client.data?.userId;
    if (!senderId) return;
    const canSend = await this.canSendMessage(senderId, data.receiverId);
    if (!canSend) return;
    const receiverSocketId = this.connectedUsers.get(data.receiverId);
    if (receiverSocketId) {
      this.server.to(receiverSocketId).emit('userTyping', { userId: senderId, isTyping: data.isTyping });
    }
  }

  @SubscribeMessage('markAsRead')
  async handleMarkAsRead(@ConnectedSocket() client: Socket, @MessageBody() data: { senderId: string }) {
    const userId = client.data?.userId;
    if (!userId) return;
    await this.chatService.markAsRead(userId, data.senderId);
    const senderSocketId = this.connectedUsers.get(data.senderId);
    if (senderSocketId) {
      this.server.to(senderSocketId).emit('messagesRead', { by: userId });
    }
  }

  @SubscribeMessage('startCall')
  handleStartCall(@ConnectedSocket() client: Socket, @MessageBody() data: { receiverId: string; type: 'audio' | 'video' }) {
    const callerId = client.data?.userId;
    if (!callerId) return;
    const receiverSocketId = this.connectedUsers.get(data.receiverId);
    if (receiverSocketId) {
      this.server.to(receiverSocketId).emit('incomingCall', { from: callerId, type: data.type });
    }
  }

  private async canSendMessage(senderId: string, receiverId: string): Promise<boolean> {
    try {
      const status = await this.friendsService.checkBlockStatus(senderId, receiverId);
      return status.canMessage;
    } catch (error) {
      return true; // Par défaut, autoriser si erreur
    }
  }

  notifyUser(userId: string, event: string, data: any) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.server.to(socketId).emit(event, data);
    }
  }
}