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
import { UseGuards } from '@nestjs/common';
import { ChatService } from './chat.service';
import { FriendsService } from '../friends/friends.service';
import { WsJwtGuard } from '../auth/ws-jwt.guard';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:4200', 'http://localhost:3000'],
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedUsers: Map<string, string> = new Map();

  constructor(
    private chatService: ChatService,
    private friendsService: FriendsService
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token;
      
      if (!token) {
        client.disconnect();
        return;
      }

      // Utiliser le guard ou vérifier le token manuellement
      const user = await this.chatService.validateUser(token);
      
      if (user && user.id) {
        this.connectedUsers.set(user.id, client.id);
        client.data.userId = user.id;
        client.join(`user_${user.id}`);
        
        this.server.emit('userOnline', { userId: user.id, isOnline: true });
        
        const onlineUsers = Array.from(this.connectedUsers.keys());
        client.emit('onlineUsers', onlineUsers);
      } else {
        client.disconnect();
      }
    } catch (error) {
      console.error('❌ Connection error:', error);
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
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    const senderId = client.data?.userId;
    
    if (!senderId) {
      client.emit('error', { message: 'Non authentifié' });
      return;
    }

    const canSend = await this.canSendMessage(senderId, data.receiverId);
    
    if (!canSend) {
      client.emit('messageBlocked', { 
        receiverId: data.receiverId, 
        reason: 'Vous avez bloqué cet utilisateur ou vous êtes bloqué' 
      });
      return;
    }

    try {
      const message = await this.chatService.saveMessage({
        ...data,
        senderId,
      });

      const receiverSocketId = this.connectedUsers.get(data.receiverId);
      if (receiverSocketId) {
        this.server.to(receiverSocketId).emit('newMessage', message);
      }

      client.emit('messageSent', message);
      
    } catch (error) {
      console.error('❌ Erreur envoi message:', error);
      client.emit('error', { message: 'Erreur lors de l\'envoi du message' });
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { receiverId: string; isTyping: boolean },
  ) {
    const senderId = client.data?.userId;
    
    if (!senderId) return;

    const canSend = await this.canSendMessage(senderId, data.receiverId);
    
    if (!canSend) return;

    const receiverSocketId = this.connectedUsers.get(data.receiverId);
    
    if (receiverSocketId) {
      this.server.to(receiverSocketId).emit('userTyping', {
        userId: senderId,
        isTyping: data.isTyping,
      });
    }
  }

  @SubscribeMessage('markAsRead')
  async handleMarkAsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { senderId: string },
  ) {
    const userId = client.data?.userId;
    
    if (!userId) return;

    await this.chatService.markAsRead(userId, data.senderId);
    
    const senderSocketId = this.connectedUsers.get(data.senderId);
    if (senderSocketId) {
      this.server.to(senderSocketId).emit('messagesRead', { 
        by: userId,
      });
    }
  }

  notifyUser(userId: string, event: string, data: any): void {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.server.to(socketId).emit(event, data);
    }
  }
  
  async canSendMessage(senderId: string, receiverId: string): Promise<boolean> {
    try {
      const status = await this.friendsService.checkBlockStatus(senderId, receiverId);
      return status.canMessage;
    } catch (error) {
      console.error('Erreur vérification blocage:', error);
      return true;
    }
  }
}