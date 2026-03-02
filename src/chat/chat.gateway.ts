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
import { ChatService } from './chat.service';
import { UseGuards } from '@nestjs/common';
import { WsJwtGuard } from '../auth/ws-jwt.guard';

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:4200',
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedUsers: Map<string, string> = new Map();

  constructor(private chatService: ChatService) {}

  async handleConnection(client: Socket) {
    try {
      const auth = client.handshake.auth;
      const token = auth && auth.token ? auth.token : null;
      
      if (!token) {
        client.disconnect();
        return;
      }

      const user = await this.chatService.validateUser(token);
      
      if (user && user.id) {
        this.connectedUsers.set(user.id, client.id);
        client.data = { ...client.data, userId: user.id };
        client.join(`user_${user.id}`);
        this.server.emit('userOnline', { userId: user.id, online: true });
        console.log(`User ${user.id} connected`);
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
      this.server.emit('userOnline', { userId, online: false });
      console.log(`User ${userId} disconnected`);
    }
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    const senderId = client.data?.userId;
    
    if (!senderId) return;

    const message = await this.chatService.saveMessage({
      ...data,
      senderId,
    });

    const receiverSocketId = this.connectedUsers.get(data.receiverId);
    if (receiverSocketId) {
      this.server.to(receiverSocketId).emit('newMessage', message);
    }

    client.emit('messageSent', message);
  }

  @SubscribeMessage('startCall')
  async handleStartCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { receiverId: string; type: 'video' | 'audio' },
  ) {
    const callerId = client.data?.userId;
    const receiverSocketId = this.connectedUsers.get(data.receiverId);

    if (receiverSocketId) {
      this.server.to(receiverSocketId).emit('incomingCall', {
        callerId,
        type: data.type,
        signal: data,
      });
    } else {
      client.emit('callFailed', { message: 'User is offline' });
    }
  }

  @SubscribeMessage('acceptCall')
  async handleAcceptCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callerId: string; signal: any },
  ) {
    const callerSocketId = this.connectedUsers.get(data.callerId);
    
    if (callerSocketId) {
      this.server.to(callerSocketId).emit('callAccepted', {
        signal: data.signal,
      });
    }
  }

  @SubscribeMessage('iceCandidate')
  async handleIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; candidate: any },
  ) {
    const userSocketId = this.connectedUsers.get(data.userId);
    
    if (userSocketId) {
      this.server.to(userSocketId).emit('iceCandidate', {
        candidate: data.candidate,
      });
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { receiverId: string; isTyping: boolean },
  ) {
    const receiverSocketId = this.connectedUsers.get(data.receiverId);
    
    if (receiverSocketId && client.data?.userId) {
      this.server.to(receiverSocketId).emit('userTyping', {
        userId: client.data.userId,
        isTyping: data.isTyping,
      });
    }
  }
}