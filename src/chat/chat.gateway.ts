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

  constructor(
    private chatService: ChatService,
    private friendsService: FriendsService
  ) {}

  async handleConnection(client: Socket) {
    try {
      const auth = client.handshake.auth;
      const token = auth && auth.token ? auth.token : null;
      
      if (!token) {
        client.disconnect();
        return;
      }

      // Utiliser validateUser au lieu de jwtService.verify directement
      const user = await this.chatService.validateUser(token);
      
      if (user && user.id) {
        this.connectedUsers.set(user.id, client.id);
        client.data = { ...client.data, userId: user.id };
        client.join(`user_${user.id}`);
        
        // Notifier tous les utilisateurs que cet utilisateur est en ligne
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

    // Vérifier le blocage
    const canSend = await this.canSendMessage(senderId, data.receiverId);
    
    if (!canSend) {
      client.emit('messageBlocked', { 
        receiverId: data.receiverId, 
        reason: 'Vous avez bloqué cet utilisateur ou vous êtes bloqué' 
      });
      return;
    }

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

  @SubscribeMessage('startCall')
  async handleStartCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { receiverId: string; type: 'video' | 'audio' },
  ) {
    const callerId = client.data?.userId;
    
    if (!callerId) return;

    // Vérifier le blocage avant de démarrer l'appel
    const canCall = await this.canSendMessage(callerId, data.receiverId);
    
    if (!canCall) {
      client.emit('callFailed', { message: 'Vous ne pouvez pas appeler cet utilisateur' });
      return;
    }

    const receiverSocketId = this.connectedUsers.get(data.receiverId);

    if (receiverSocketId) {
      // Récupérer les infos de l'appelant
      const callerInfo = await this.chatService.getUserInfo(callerId);
      
      this.server.to(receiverSocketId).emit('incomingCall', {
        callerId,
        callerName: callerInfo ? `${callerInfo.firstName} ${callerInfo.lastName}` : 'Utilisateur',
        type: data.type,
        signal: data,
      });
    } else {
      client.emit('callFailed', { message: 'Utilisateur hors ligne' });
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

  @SubscribeMessage('rejectCall')
  async handleRejectCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callerId: string },
  ) {
    const callerSocketId = this.connectedUsers.get(data.callerId);
    
    if (callerSocketId) {
      this.server.to(callerSocketId).emit('callRejected', {
        message: 'Appel refusé',
      });
    }
  }

  @SubscribeMessage('endCall')
  async handleEndCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { receiverId: string },
  ) {
    const receiverSocketId = this.connectedUsers.get(data.receiverId);
    
    if (receiverSocketId) {
      this.server.to(receiverSocketId).emit('callEnded', {
        message: 'Appel terminé',
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
      return false;
    }
  }
}