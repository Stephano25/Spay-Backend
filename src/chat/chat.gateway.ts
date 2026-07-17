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
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FriendsService } from '../friends/friends.service';
import { ConversationsService } from '../conversations/conversations.service';
import { Message, MessageDocument } from './schemas/message.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:4200', 'http://localhost:4201', 'http://localhost:3000', 'http://localhost:19000'],
    credentials: true,
  },
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
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
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

      client.data.userId = userId;
      this.addUserSocket(userId, client.id);
      this.userStatus.set(userId, { isOnline: true, lastSeen: new Date() });

      this.logger.log(`✅ Socket connecté: ${client.id} pour l'utilisateur ${userId}`);
      this.logger.log(`📊 Utilisateurs connectés: ${this.userSockets.size}`);

      await this.notifyFriendsStatus(userId, true);
      client.join(`user:${userId}`);

      client.emit('onlineUsers', this.getOnlineUsers());

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

      const sockets = this.userSockets.get(userId);
      if (!sockets || sockets.size === 0) {
        this.userStatus.set(userId, { isOnline: false, lastSeen: new Date() });
        await this.notifyFriendsStatus(userId, false);
        this.logger.log(`👤 Utilisateur ${userId} est hors ligne`);
      }
    }
  }

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

  notifyAll(event: string, data: any) {
    this.server.emit(event, data);
    this.logger.log(`📤 Notification ${event} envoyée à tous`);
  }

  getOnlineUsers(): string[] {
    const onlineUsers: string[] = [];
    for (const [userId, status] of this.userStatus) {
      if (status.isOnline) {
        onlineUsers.push(userId);
      }
    }
    return onlineUsers;
  }

  isUserOnline(userId: string): boolean {
    const status = this.userStatus.get(userId);
    return status?.isOnline || false;
  }

  getUserStatus(userId: string): { isOnline: boolean; lastSeen: Date } | null {
    return this.userStatus.get(userId) || null;
  }

  getUserIdFromSocket(client: Socket): string | null {
    return client.data.userId || null;
  }

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
  // ENVOI DE MESSAGES - SAUVEGARDE COMPLÈTE EN BASE
  // ============================================================

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    const userId = client.data.userId;
    if (!userId) {
      client.emit('messageError', { error: 'Utilisateur non authentifié' });
      return;
    }

    this.logger.log(`📩 Message de ${userId} vers ${data.receiverId} - Type: ${data.type}`);

    try {
      const receiverId = data.receiverId;
      if (!receiverId) {
        client.emit('messageError', { error: 'Destinataire manquant' });
        return;
      }

      if (userId === receiverId) {
        client.emit('messageError', { error: 'Vous ne pouvez pas vous envoyer un message à vous-même' });
        return;
      }

      // ✅ Récupérer les informations de l'expéditeur
      const senderInfo = await this.getUserInfo(userId);

      // ✅ Préparer les données du message - TOUS LES CHAMPS
      const messageData = {
        senderId: userId,
        receiverId: receiverId,
        type: data.type || 'text',
        content: data.content || '',
        fileUrl: data.fileUrl || null,
        fileName: data.fileName || null,
        fileSize: data.fileSize || null,
        mimeType: data.mimeType || null,
        emoji: data.emoji || null,
        moneyTransfer: data.moneyTransfer || null,
        duration: data.duration || null,
        thumbnail: data.thumbnail || null,
        isRead: false,
        isDelivered: false,
      };

      this.logger.log(`✅ Message créé: type=${messageData.type}, fileUrl=${messageData.fileUrl ? 'oui' : 'non'}`);

      // ✅ SAUVEGARDER EN BASE DE DONNÉES
      let savedMessage = null;
      try {
        savedMessage = await this.saveMessageToDatabase(messageData);
        this.logger.log(`✅ Message sauvegardé en base: ${savedMessage?._id} (${savedMessage?.type})`);
      } catch (dbError) {
        this.logger.error('❌ Erreur sauvegarde en base:', dbError);
        // Continuer quand même pour ne pas bloquer l'envoi
      }

      // ✅ Construire le message final avec l'ID de la base de données
      const message = {
        id: savedMessage?._id?.toString() || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        senderId: userId,
        receiverId: receiverId,
        type: messageData.type,
        content: messageData.content,
        fileUrl: messageData.fileUrl,
        fileName: messageData.fileName,
        fileSize: messageData.fileSize,
        mimeType: messageData.mimeType,
        emoji: messageData.emoji,
        moneyTransfer: messageData.moneyTransfer,
        duration: messageData.duration,
        thumbnail: messageData.thumbnail,
        createdAt: savedMessage?.createdAt || new Date(),
        isRead: false,
        isDelivered: false,
        sender: senderInfo,
      };

      // ✅ Envoyer au destinataire
      this.notifyUser(receiverId, 'newMessage', message);

      // ✅ Confirmation à l'expéditeur
      client.emit('messageSent', message);

      // ✅ Mettre à jour la conversation du destinataire
      this.notifyUser(receiverId, 'conversationUpdated', {
        userId: userId,
        firstName: senderInfo?.firstName || 'Utilisateur',
        lastName: senderInfo?.lastName || '',
        lastMessage: message,
        lastMessageTime: message.createdAt,
      });

      return message;

    } catch (error) {
      this.logger.error('❌ Erreur envoi message:', error);
      client.emit('messageError', {
        error: 'Erreur lors de l\'envoi du message',
        details: error.message
      });
    }
  }

  /**
   * ✅ Sauvegarde un message en base de données - TOUS LES CHAMPS
   */
  private async saveMessageToDatabase(messageData: any): Promise<any> {
    try {
      const message = new this.messageModel({
        senderId: new Types.ObjectId(messageData.senderId),
        receiverId: new Types.ObjectId(messageData.receiverId),
        type: messageData.type || 'text',
        content: messageData.content || '',
        fileUrl: messageData.fileUrl || null,
        fileName: messageData.fileName || null,
        fileSize: messageData.fileSize || null,
        mimeType: messageData.mimeType || null,
        emoji: messageData.emoji || null,
        moneyTransfer: messageData.moneyTransfer || null,
        duration: messageData.duration || null,
        thumbnail: messageData.thumbnail || null,
        isRead: false,
        isDelivered: false,
      });

      await message.save();
      this.logger.log(`✅ Message sauvegardé: ${message._id} (${message.type})`);

      // Populer les informations de l'expéditeur
      await message.populate('senderId', 'firstName lastName profilePicture');

      return message;
    } catch (error) {
      this.logger.error('❌ Erreur sauvegarde message:', error);
      throw error;
    }
  }

  /**
   * ✅ Récupère les informations d'un utilisateur
   */
  private async getUserInfo(userId: string): Promise<any> {
    try {
      const user = await this.userModel.findById(userId).select('firstName lastName profilePicture');
      if (user) {
        return {
          id: user._id.toString(),
          firstName: user.firstName,
          lastName: user.lastName,
          profilePicture: user.profilePicture,
        };
      }
    } catch (error) {
      this.logger.error('❌ Erreur récupération utilisateur:', error);
    }
    return {
      id: userId,
      firstName: 'Utilisateur',
      lastName: '',
    };
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { receiverId: string; isTyping: boolean },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    this.logger.log(`✍️ Typing: ${userId} -> ${data.receiverId} (${data.isTyping})`);
    this.notifyUser(data.receiverId, 'userTyping', {
      userId,
      isTyping: data.isTyping,
    });
  }

  @SubscribeMessage('getOnlineUsers')
  async handleGetOnlineUsers(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId;
    if (!userId) return;

    const onlineUsers = this.getOnlineUsers();
    client.emit('onlineUsers', onlineUsers);
  }

  @SubscribeMessage('readMessages')
  async handleReadMessages(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { receiverId: string; messageIds: string[] },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    try {
      await this.messageModel.updateMany(
        {
          _id: { $in: data.messageIds.map(id => new Types.ObjectId(id)) },
          receiverId: new Types.ObjectId(userId),
        },
        { isRead: true }
      );

      this.notifyUser(data.receiverId, 'messagesRead', {
        userId,
        messageIds: data.messageIds,
      });
    } catch (error) {
      this.logger.error('❌ Erreur marquage lu:', error);
    }
  }
}