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
import { Logger, UseGuards, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { FriendsService } from '../friends/friends.service';
import { ConversationsService } from '../conversations/conversations.service';

// ✅ Interface pour les messages
interface MessageData {
  conversationId: string;
  content: string;
  type?: 'text' | 'image' | 'file';
}

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:4200', 'http://localhost:4201', 'http://localhost:3000'],
    credentials: true,
  },
  // ✅ Utiliser le namespace par défaut '/' (ne pas spécifier de namespace)
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private userSockets: Map<string, Set<string>> = new Map();
  private userStatus: Map<string, { isOnline: boolean; lastSeen: Date }> = new Map();

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    @Inject(forwardRef(() => ConversationsService))
    private conversationsService: ConversationsService,
    @Inject(forwardRef(() => FriendsService))
    private friendsService: FriendsService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token || 
                    client.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        this.logger.warn('❌ Connexion sans token');
        client.disconnect();
        return;
      }

      const secret = this.configService.get<string>('JWT_SECRET');
      if (!secret) {
        this.logger.error('❌ JWT_SECRET non configuré');
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, { secret });
      const userId = payload.userId || payload.sub;

      if (!userId) {
        this.logger.warn('❌ Token sans userId');
        client.disconnect();
        return;
      }

      // ✅ Stocker la connexion
      client.data.userId = userId;
      this.addUserSocket(userId, client.id);
      
      // ✅ Mettre à jour le statut
      this.userStatus.set(userId, { isOnline: true, lastSeen: new Date() });
      
      this.logger.log(`✅ Socket connecté: ${client.id} pour l'utilisateur ${userId}`);
      this.logger.log(`📊 Utilisateurs connectés: ${this.userSockets.size}`);

      // ✅ Notifier les amis que l'utilisateur est en ligne
      await this.notifyFriendsStatus(userId, true);

      // ✅ Rejoindre la room de l'utilisateur
      client.join(`user:${userId}`);

    } catch (error) {
      this.logger.error('❌ Erreur de connexion socket:', error);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    
    if (userId) {
      this.removeUserSocket(userId, client.id);
      this.logger.log(`🔌 Socket déconnecté: ${client.id} pour l'utilisateur ${userId}`);
      
      // ✅ Vérifier s'il reste des connexions
      const sockets = this.userSockets.get(userId);
      if (!sockets || sockets.size === 0) {
        // ✅ Mettre à jour le statut
        this.userStatus.set(userId, { isOnline: false, lastSeen: new Date() });
        // ✅ Notifier les amis que l'utilisateur est hors ligne
        await this.notifyFriendsStatus(userId, false);
        this.logger.log(`👤 Utilisateur ${userId} est hors ligne`);
      }
    }
  }

  // ============================================================
  // GESTION DES SOCKETS
  // ============================================================

  private addUserSocket(userId: string, socketId: string) {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socketId);
  }

  private removeUserSocket(userId: string, socketId: string) {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);
      }
    }
  }

  /**
   * ✅ Notifie un utilisateur spécifique
   */
  notifyUser(userId: string, event: string, data: any): void {
    try {
      const sockets = this.userSockets.get(userId);
      if (sockets && sockets.size > 0) {
        this.logger.log(`📤 Notification ${event} envoyée à ${userId}`);
        this.server.to(`user:${userId}`).emit(event, data);
      } else {
        this.logger.warn(`⚠️ Utilisateur ${userId} non connecté, notification ${event} non envoyée`);
      }
    } catch (error) {
      this.logger.error(`❌ Erreur notification ${event} à ${userId}:`, error);
    }
  }

  /**
   * ✅ Notifie tous les utilisateurs
   */
  notifyAll(event: string, data: any) {
    this.server.emit(event, data);
    this.logger.log(`📤 Notification ${event} envoyée à tous`);
  }

  /**
   * ✅ Récupérer tous les utilisateurs en ligne
   */
  getOnlineUsers(): string[] {
    const onlineUsers: string[] = [];
    for (const [userId, status] of this.userStatus) {
      if (status.isOnline) {
        onlineUsers.push(userId);
      }
    }
    return onlineUsers;
  }

  /**
   * ✅ Vérifier si un utilisateur est en ligne
   */
  isUserOnline(userId: string): boolean {
    const status = this.userStatus.get(userId);
    return status?.isOnline || false;
  }

  /**
   * ✅ Récupérer le statut d'un utilisateur
   */
  getUserStatus(userId: string): { isOnline: boolean; lastSeen: Date } | null {
    return this.userStatus.get(userId) || null;
  }

  /**
   * ✅ Méthode pour récupérer l'ID utilisateur depuis un socket
   */
  getUserIdFromSocket(client: Socket): string | null {
    return client.data.userId || null;
  }

  /**
   * ✅ Notifier les amis du statut en ligne
   */
  private async notifyFriendsStatus(userId: string, isOnline: boolean) {
    try {
      const friends = await this.friendsService.getFriends(userId);
      
      for (const friend of friends) {
        const friendId = friend.friend?.id;
        if (friendId) {
          const friendSockets = this.userSockets.get(friendId);
          if (friendSockets && friendSockets.size > 0) {
            this.server.to(`user:${friendId}`).emit('userStatus', {
              userId,
              isOnline,
              lastSeen: new Date(),
            });
          }
        }
      }
    } catch (error) {
      this.logger.error('❌ Erreur notification statut:', error);
    }
  }

  // ============================================================
  // MESSAGES
  // ============================================================

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: MessageData,
  ) {
    const userId = client.data.userId;
    if (!userId) {
      client.emit('messageError', { error: 'Utilisateur non authentifié' });
      return;
    }

    this.logger.log(`📩 Message de ${userId} dans ${data.conversationId}`);

    try {
      // ✅ Vérifier la conversation
      const conversation = await this.conversationsService.getConversationById(
        data.conversationId,
        userId,
      );

      if (!conversation) {
        client.emit('messageError', { error: 'Conversation non trouvée' });
        return;
      }

      // ✅ Créer le message
      const message = {
        id: `msg_${Date.now()}`,
        conversationId: data.conversationId,
        senderId: userId,
        content: data.content,
        type: data.type || 'text',
        createdAt: new Date(),
        isRead: false,
      };

      // ✅ Envoyer le message à tous les participants
      for (const participant of conversation.participants) {
        const participantId = participant._id?.toString() || participant.toString();
        if (participantId !== userId) {
          this.notifyUser(participantId, 'newMessage', message);
        }
      }

      // ✅ Confirmation à l'expéditeur
      client.emit('messageSent', message);

      return message;
    } catch (error) {
      this.logger.error('❌ Erreur envoi message:', error);
      client.emit('messageError', { error: 'Erreur lors de l\'envoi du message' });
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; isTyping: boolean },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    try {
      const conversation = await this.conversationsService.getConversationById(
        data.conversationId,
        userId,
      );

      if (conversation) {
        for (const participant of conversation.participants) {
          const participantId = participant._id?.toString() || participant.toString();
          if (participantId !== userId) {
            this.notifyUser(participantId, 'typing', {
              userId,
              conversationId: data.conversationId,
              isTyping: data.isTyping,
            });
          }
        }
      }
    } catch (error) {
      this.logger.error('❌ Erreur typing:', error);
    }
  }

  @SubscribeMessage('readMessages')
  async handleReadMessages(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; messageIds: string[] },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    try {
      const conversation = await this.conversationsService.getConversationById(
        data.conversationId,
        userId,
      );

      if (conversation) {
        for (const participant of conversation.participants) {
          const participantId = participant._id?.toString() || participant.toString();
          if (participantId !== userId) {
            this.notifyUser(participantId, 'messagesRead', {
              conversationId: data.conversationId,
              userId,
              messageIds: data.messageIds,
            });
          }
        }
      }
    } catch (error) {
      this.logger.error('❌ Erreur marquage lu:', error);
    }
  }

  @SubscribeMessage('joinConversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    try {
      const conversation = await this.conversationsService.getConversationById(
        data.conversationId,
        userId,
      );

      if (conversation) {
        client.join(`conversation:${data.conversationId}`);
        this.logger.log(`👤 ${userId} a rejoint la conversation ${data.conversationId}`);
        client.emit('conversationJoined', { conversationId: data.conversationId });
      }
    } catch (error) {
      this.logger.error('❌ Erreur joinConversation:', error);
      client.emit('conversationError', { error: 'Conversation non trouvée' });
    }
  }

  @SubscribeMessage('leaveConversation')
  async handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.leave(`conversation:${data.conversationId}`);
    this.logger.log(`👤 ${client.data.userId} a quitté la conversation ${data.conversationId}`);
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    client.join(data.roomId);
    this.logger.log(`👤 ${client.data.userId} a rejoint la room ${data.roomId}`);
  }

  @SubscribeMessage('leaveRoom')
  async handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    client.leave(data.roomId);
    this.logger.log(`👤 ${client.data.userId} a quitté la room ${data.roomId}`);
  }
}