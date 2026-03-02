import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: Socket = context.switchToWs().getClient();
      const auth = client.handshake.auth;
      const token = auth && auth.token ? auth.token : null;
      
      if (!token) {
        throw new WsException('Unauthorized');
      }

      const payload = this.jwtService.verify(token);
      client.data = { ...client.data, userId: payload.sub };
      
      return true;
    } catch (err) {
      throw new WsException('Unauthorized');
    }
  }
}