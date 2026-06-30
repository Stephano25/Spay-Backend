// ============================================================
// CHAT GATEWAY - SPaye
// ============================================================

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
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { FriendsService } from '../friends/friends.service';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
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

  async handleConnection(client: Socket): Promise<void> {
    try {
      // Récupérer le token
      let token = client.handshake.auth?.token ||
                  client.handshake.headers?.authorization?.replace('Bearer ', '');

      console.log(`🔌 Nouvelle connexion, token: ${token ? 'présent' : 'absent'}`);

      if (!token) {
        console.warn('🔴 Token manquant, déconnexion');
        client.emit('error', { message: 'Token manquant' });
        client.disconnect();
        return;
      }

      // Vérifier que JWT_SECRET est défini
      const secret = this.configService.get<string>('JWT_SECRET');
      
      if (!secret) {
        console.error('❌ JWT_SECRET non défini dans .env');
        client.emit('error', { message: 'Erreur de configuration serveur' });
        client.disconnect();
        return;
      }

      console.log(`🔐 Vérification du token avec JWT_SECRET: ${secret.substring(0, 10)}...`);

      // Vérifier le token avec la même clé
      const payload = this.jwtService.verify(token, {
        secret: secret,
      });

      const userId = payload.sub;
      console.log(`🔑 Utilisateur authentifié: ${userId}`);

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
      console.log(`✅ Utilisateur ${userId} connecté, socket: ${client.id}`);

      // Récupérer les amis et les notifier
      try {
        const friends = await this.friendsService.getFriends(userId);
        console.log(`👥 ${userId} a ${friends.length} amis`);

        if (friends.length > 0) {
          for (const f of friends) {
            const friendId = f.friendId?.toString();
            if (friendId && friendId !== userId) {
              const isFriendConnected = this.connectedUsers.has(friendId);
              console.log(`📤 Envoi userOnline à ${friendId}, connecté: ${isFriendConnected}`);
              
              this.server.to(`user_${friendId}`).emit('userOnline', {
                userId: userId,
                isOnline: true,
              });
            }
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
        console.error('❌ Erreur lors de la récupération des amis:', errorMessage);
      }

      // Envoyer la liste des utilisateurs connectés
      const onlineUsers = Array.from(this.connectedUsers.keys());
      console.log(`📊 Utilisateurs connectés:`, onlineUsers);
      client.emit('onlineUsers', onlineUsers);

      console.log(`✅ Connexion terminée pour ${userId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      const errorStack = error instanceof Error ? error.stack : '';
      console.error('❌ Erreur de connexion:', errorMessage);
      console.error('❌ Stack:', errorStack);
      client.emit('error', { message: 'Erreur d\'authentification' });
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const userId = client.data?.userId;
    if (!userId) {
      console.log('🔴 Déconnexion sans userId');
      return;
    }

    console.log(`🔌 Déconnexion de ${userId}, socket: ${client.id}`);

    const sockets = this.userSockets.get(userId) || [];
    const index = sockets.indexOf(client.id);
    if (index !== -1) {
      sockets.splice(index, 1);
    }

    if (sockets.length === 0) {
      this.userSockets.delete(userId);
      this.connectedUsers.delete(userId);
      console.log(`❌ ${userId} complètement déconnecté`);

      // Notifier les amis que l'utilisateur est hors ligne
      try {
        const friends = await this.friendsService.getFriends(userId);
        for (const f of friends) {
          const friendId = f.friendId?.toString();
          if (friendId && friendId !== userId) {
            console.log(`📤 Envoi userOnline(false) à ${friendId}`);
            this.server.to(`user_${friendId}`).emit('userOnline', {
              userId: userId,
              isOnline: false,
            });
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
        console.error('❌ Erreur lors de la notification de déconnexion:', errorMessage);
      }
    } else {
      console.log(`ℹ️ ${userId} a encore ${sockets.length} socket(s) ouverte(s)`);
    }
  }

  // ============================================================
  // MÉTHODES UTILITAIRES
  // ============================================================

  getOnlineUsers(): string[] {
    return Array.from(this.connectedUsers.keys());
  }

  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  // ============================================================
  // SUBSCRIBE MESSAGES
  // ============================================================

  @SubscribeMessage('sendMessage')
  async handleMessage(@ConnectedSocket() client: Socket, @MessageBody() data: any): Promise<void> {
    const senderId = client.data?.userId;
    if (!senderId) {
      client.emit('error', { message: 'Non authentifié' });
      return;
    }

    console.log(`📤 Message de ${senderId} à ${data.receiverId}:`, data.content);

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
      console.log(`📤 Envoi du message à ${receiverSocketIds.length} socket(s)`);
      
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
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      console.error('Erreur lors de l\'envoi du message:', errorMessage);
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
  ): Promise<void> {
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
  ): Promise<void> {
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
  ): Promise<void> {
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
  ): Promise<void> {
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

  @SubscribeMessage('getOnlineUsers')
  handleGetOnlineUsers(@ConnectedSocket() client: Socket): void {
    const userId = client.data?.userId;
    if (!userId) return;

    const onlineUsers = Array.from(this.connectedUsers.keys());
    console.log(`📊 Demande des utilisateurs connectés par ${userId}:`, onlineUsers);
    client.emit('onlineUsers', onlineUsers);
  }

  notifyUser(userId: string, event: string, data: any): void {
    const socketIds = this.userSockets.get(userId);
    if (socketIds) {
      socketIds.forEach((socketId) => {
        this.server.to(socketId).emit(event, data);
      });
    }
  }
}