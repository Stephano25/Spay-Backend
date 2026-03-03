import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    if (!user) {
      throw new ForbiddenException('Utilisateur non authentifié');
    }
    
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      throw new ForbiddenException('Accès réservé aux administrateurs');
    }
    
    return true;
  }
}