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
import { FriendsService } from '../friends/friends.service';
import { UseGuards } from '@nestjs/common';

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
      const auth = client.handshake.auth;
      const token = auth && auth.token ? auth.token : null;
      
      if (!token) {
        console.log('❌ Pas de token, déconnexion');
        client.disconnect();
        return;
      }

      const user = await this.chatService.validateUser(token);
      
      if (user && user.id) {
        this.connectedUsers.set(user.id, client.id);
        client.data = { userId: user.id };
        client.join(`user_${user.id}`);
        
        // Notifier tous les utilisateurs que cet utilisateur est en ligne
        this.server.emit('userOnline', { userId: user.id, isOnline: true });
        console.log(`✅ User ${user.id} connected (${user.email})`);
        
        // Envoyer la liste des utilisateurs en ligne au nouveau client
        const onlineUsers = Array.from(this.connectedUsers.keys());
        client.emit('onlineUsers', onlineUsers);
      } else {
        console.log('❌ Utilisateur non valide, déconnexion');
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
      console.log(`📴 User ${userId} disconnected`);
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

    // Vérifier le blocage
    const canSend = await this.canSendMessage(senderId, data.receiverId);
    
    if (!canSend) {
      client.emit('messageBlocked', { 
        receiverId: data.receiverId, 
        reason: 'Vous avez bloqué cet utilisateur ou vous êtes bloqué' 
      });
      return;
    }

    try {
      // Sauvegarder le message
      const message = await this.chatService.saveMessage({
        ...data,
        senderId,
      });

      // Envoyer au destinataire s'il est en ligne
      const receiverSocketId = this.connectedUsers.get(data.receiverId);
      if (receiverSocketId) {
        this.server.to(receiverSocketId).emit('newMessage', message);
      }

      // Confirmer l'envoi à l'expéditeur
      client.emit('messageSent', message);
      
      console.log(`📨 Message envoyé: ${senderId} -> ${data.receiverId}`);
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

    // Vérifier le blocage avant d'envoyer l'indicateur de frappe
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
    
    // Notifier l'expéditeur que ses messages ont été lus
    const senderSocketId = this.connectedUsers.get(data.senderId);
    if (senderSocketId) {
      this.server.to(senderSocketId).emit('messagesRead', { 
        by: userId,
      });
    }
  }

  /**
   * Notifier un utilisateur spécifique
   */
  notifyUser(userId: string, event: string, data: any): void {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.server.to(socketId).emit(event, data);
    }
  }
  
  /**
   * Vérifier si un message peut être envoyé (pas de blocage)
   */
  async canSendMessage(senderId: string, receiverId: string): Promise<boolean> {
    try {
      const status = await this.friendsService.checkBlockStatus(senderId, receiverId);
      return status.canMessage;
    } catch (error) {
      console.error('Erreur vérification blocage:', error);
      return true; // En cas d'erreur, autoriser par défaut
    }
  }
}