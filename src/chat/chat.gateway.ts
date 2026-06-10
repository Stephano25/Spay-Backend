import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect, ConnectedSocket, MessageBody } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { forwardRef, Inject } from '@nestjs/common';
import { ChatService } from './chat.service';
import { FriendsService } from '../friends/friends.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({ cors: { origin: ['http://localhost:4200', 'http://localhost:3000'], credentials: true }, namespace: '/' })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private connectedUsers = new Map<string, string>(); // userId -> socketId
  private userSockets = new Map<string, string[]>();   // userId -> socketIds

  constructor(
    private chatService: ChatService,
    @Inject(forwardRef(() => FriendsService)) private friendsService: FriendsService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) return client.disconnect();
      const payload = this.jwtService.verify(token, { secret: this.configService.get('JWT_SECRET') });
      const userId = payload.sub;
      if (!userId) return client.disconnect();
      client.data.userId = userId;
      this.connectedUsers.set(userId, client.id);
      if (!this.userSockets.has(userId)) this.userSockets.set(userId, []);
      this.userSockets.get(userId).push(client.id);
      client.join(`user_${userId}`);
      const friends = await this.friendsService.getFriends(userId);
      const friendIds = friends.map(f => f.friendId || f.userId);
      friendIds.forEach(fid => this.server.to(`user_${fid}`).emit('userOnline', { userId, isOnline: true }));
      client.emit('onlineUsers', Array.from(this.connectedUsers.keys()));
    } catch (error) { client.disconnect(); }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    if (userId) {
      const sockets = this.userSockets.get(userId) || [];
      const index = sockets.indexOf(client.id);
      if (index !== -1) sockets.splice(index, 1);
      if (sockets.length === 0) {
        this.userSockets.delete(userId);
        this.connectedUsers.delete(userId);
        this.friendsService.getFriends(userId).then(friends => {
          const friendIds = friends.map(f => f.friendId || f.userId);
          friendIds.forEach(fid => this.server.to(`user_${fid}`).emit('userOnline', { userId, isOnline: false }));
        }).catch(console.error);
      }
    }
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    const senderId = client.data?.userId;
    if (!senderId) return client.emit('error', { message: 'Non authentifié' });
    const canSend = await this.friendsService.checkBlockStatus(senderId, data.receiverId);
    if (!canSend.canMessage) return client.emit('messageBlocked', { receiverId: data.receiverId, reason: 'Bloqué' });
    try {
      const message = await this.chatService.saveMessage({ ...data, senderId });
      const receiverSocketIds = this.userSockets.get(data.receiverId) || [];
      receiverSocketIds.forEach(sid => this.server.to(sid).emit('newMessage', message));
      client.emit('messageSent', message);
      this.server.to(`user_${data.receiverId}`).emit('conversationUpdated', {
        userId: senderId,
        lastMessage: message.content || (message.type === 'emoji' ? message.emoji : '[Média]'),
        lastMessageTime: message.createdAt
      });
    } catch (error) { client.emit('error', { message: 'Erreur envoi' }); }
  }

  @SubscribeMessage('typing')
  async handleTyping(@ConnectedSocket() client: Socket, @MessageBody() data: { receiverId: string; isTyping: boolean }) {
    const senderId = client.data?.userId;
    if (!senderId) return;
    const canSend = await this.friendsService.checkBlockStatus(senderId, data.receiverId);
    if (!canSend.canMessage) return;
    const receiverSocketIds = this.userSockets.get(data.receiverId) || [];
    receiverSocketIds.forEach(sid => this.server.to(sid).emit('userTyping', { userId: senderId, isTyping: data.isTyping }));
  }

  @SubscribeMessage('markAsRead')
  async handleMarkAsRead(@ConnectedSocket() client: Socket, @MessageBody() data: { senderId: string }) {
    const userId = client.data?.userId;
    if (!userId) return;
    await this.chatService.markAsRead(userId, data.senderId);
    const senderSocketIds = this.userSockets.get(data.senderId) || [];
    senderSocketIds.forEach(sid => this.server.to(sid).emit('messagesRead', { by: userId }));
  }

  // chat/chat.gateway.ts
  // Ajoutez cette méthode publique dans la classe ChatGateway
  notifyUser(userId: string, event: string, data: any) {
    const socketIds = this.userSockets.get(userId);
    if (socketIds) {
      socketIds.forEach(socketId => {
        this.server.to(socketId).emit(event, data);
      });
    }
  }
}