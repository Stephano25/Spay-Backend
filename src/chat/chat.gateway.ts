// backend/src/chat/chat.gateway.ts
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
import { forwardRef, Inject } from '@nestjs/common';
import { ChatService } from './chat.service';
import { FriendsService } from '../friends/friends.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private connectedUsers = new Map<string, string>();
  private userSockets = new Map<string, string[]>();

  constructor(
    @Inject(forwardRef(() => ChatService)) private chatService: ChatService,
    @Inject(forwardRef(() => FriendsService)) private friendsService: FriendsService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        console.warn('🔴 Token manquant, déconnexion');
        client.emit('error', { message: 'Token manquant' });
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_SECRET'),
      });

      const userId = payload.sub;
      if (!userId) {
        console.warn('🔴 UserId manquant dans le token');
        client.disconnect();
        return;
      }

      // Stocker l'utilisateur
      client.data.userId = userId;
      this.connectedUsers.set(userId, client.id);

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, []);
      }
      this.userSockets.get(userId).push(client.id);

      client.join(`user_${userId}`);

      // 🔥 Récupérer les amis et les notifier
      try {
        const friends = await this.friendsService.getFriends(userId);
        console.log(`👥 Amis de ${userId}:`, friends.length);
        
        // Filtrer les IDs valides
        const friendIds = friends
          .map((f) => f.friendId || f.userId)
          .filter((id) => id && id.toString() !== userId);

        console.log(`📤 Notification aux amis:`, friendIds);

        friendIds.forEach((fid) => {
          this.server.to(`user_${fid}`).emit('userOnline', {
            userId: userId,
            isOnline: true,
          });
        });
      } catch (error) {
        console.error('Erreur lors de la récupération des amis:', error);
      }

      client.emit('onlineUsers', Array.from(this.connectedUsers.keys()));
      console.log(`✅ Utilisateur connecté: ${userId}`);
    } catch (error) {
      console.error('❌ Erreur de connexion:', error);
      client.emit('error', { message: 'Erreur d\'authentification' });
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    if (!userId) return;

    const sockets = this.userSockets.get(userId) || [];
    const index = sockets.indexOf(client.id);
    if (index !== -1) {
      sockets.splice(index, 1);
    }

    if (sockets.length === 0) {
      this.userSockets.delete(userId);
      this.connectedUsers.delete(userId);

      // 🔥 Notifier les amis que l'utilisateur est hors ligne
      try {
        const friends = await this.friendsService.getFriends(userId);
        const friendIds = friends
          .map((f) => f.friendId || f.userId)
          .filter((id) => id && id.toString() !== userId);

        friendIds.forEach((fid) => {
          this.server.to(`user_${fid}`).emit('userOnline', {
            userId: userId,
            isOnline: false,
          });
        });
      } catch (error) {
        console.error('Erreur lors de la notification de déconnexion:', error);
      }
    }

    console.log(`❌ Utilisateur déconnecté: ${userId}`);
  }

  /**
   * 🔥 Récupère les utilisateurs connectés (utilisée par AdminService)
   */
  getOnlineUsers(): string[] {
    return Array.from(this.connectedUsers.keys());
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    const senderId = client.data?.userId;
    if (!senderId) {
      client.emit('error', { message: 'Non authentifié' });
      return;
    }

    if (senderId === data.receiverId) {
      client.emit('error', { message: 'Vous ne pouvez pas vous envoyer de message à vous-même' });
      return;
    }

    const canSend = await this.friendsService.checkBlockStatus(senderId, data.receiverId);
    if (!canSend.canMessage) {
      client.emit('messageBlocked', {
        receiverId: data.receiverId,
        reason: 'Bloqué',
      });
      return;
    }

    try {
      const message = await this.chatService.saveMessage({
        ...data,
        senderId,
      });

      const receiverSocketIds = this.userSockets.get(data.receiverId) || [];
      receiverSocketIds.forEach((sid) => {
        this.server.to(sid).emit('newMessage', message);
      });

      client.emit('messageSent', message);

      this.server.to(`user_${data.receiverId}`).emit('conversationUpdated', {
        userId: senderId,
        lastMessage: this.getLastMessagePreview(message),
        lastMessageTime: message.createdAt,
      });
    } catch (error) {
      console.error('Erreur lors de l\'envoi du message:', error);
      client.emit('error', { message: 'Erreur lors de l\'envoi du message' });
    }
  }

  private getLastMessagePreview(message: any): string {
    if (message.type === 'emoji') return message.emoji;
    if (message.type === 'money') {
      const status = message.moneyTransfer?.status;
      const amount = message.moneyTransfer?.amount ?? 0;
      if (status === 'failed') return `💸 Transfert échoué (${amount} Ar)`;
      return `💸 Transfert de ${amount} Ar`;
    }
    if (message.type === 'image') return '📷 Photo';
    if (message.type === 'file') return `📎 ${message.fileName || 'Fichier'}`;
    return message.content || '[Média]';
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { receiverId: string; isTyping: boolean },
  ) {
    const senderId = client.data?.userId;
    if (!senderId) return;

    const canSend = await this.friendsService.checkBlockStatus(senderId, data.receiverId);
    if (!canSend.canMessage) return;

    const receiverSocketIds = this.userSockets.get(data.receiverId) || [];
    receiverSocketIds.forEach((sid) => {
      this.server.to(sid).emit('userTyping', {
        userId: senderId,
        isTyping: data.isTyping,
      });
    });
  }

  @SubscribeMessage('markAsRead')
  async handleMarkAsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { senderId: string },
  ) {
    const userId = client.data?.userId;
    if (!userId) return;

    await this.chatService.markAsRead(userId, data.senderId);

    const senderSocketIds = this.userSockets.get(data.senderId) || [];
    senderSocketIds.forEach((sid) => {
      this.server.to(sid).emit('messagesRead', { by: userId });
    });
  }

  @SubscribeMessage('startCall')
  async handleStartCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { receiverId: string; type: 'audio' | 'video' },
  ) {
    const senderId = client.data?.userId;
    if (!senderId) return;

    const receiverSocketIds = this.userSockets.get(data.receiverId) || [];
    receiverSocketIds.forEach((sid) => {
      this.server.to(sid).emit('incomingCall', {
        from: senderId,
        type: data.type,
      });
    });
  }

  @SubscribeMessage('answerCall')
  async handleAnswerCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callerId: string; accepted: boolean },
  ) {
    const userId = client.data?.userId;
    if (!userId) return;

    const callerSocketIds = this.userSockets.get(data.callerId) || [];
    callerSocketIds.forEach((sid) => {
      this.server.to(sid).emit('callAnswered', {
        by: userId,
        accepted: data.accepted,
      });
    });
  }

  /**
   * 🔥 Notifie un utilisateur d'un événement (utilisé par ChatService)
   */
  notifyUser(userId: string, event: string, data: any) {
    const socketIds = this.userSockets.get(userId);
    if (socketIds) {
      socketIds.forEach((socketId) => {
        this.server.to(socketId).emit(event, data);
      });
    }
  }

  /**
   * 🔥 Récupère le nombre d'utilisateurs connectés
   */
  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }
}