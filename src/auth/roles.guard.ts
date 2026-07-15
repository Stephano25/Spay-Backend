// src/auth/guards/roles.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../users/schemas/user.schema';

// ✅ CORRECTION: Définir la constante ROLES_KEY
export const ROLES_KEY = 'roles';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // ✅ CORRECTION: Utiliser la constante ROLES_KEY
    const requiredRoles = this.reflector.get<UserRole[]>(ROLES_KEY, context.getHandler());
    
    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Non authentifié');
    }

    // Vérifier si l'utilisateur a l'un des rôles requis
    const hasRole = requiredRoles.some((role) => user.role === role);
    
    if (!hasRole) {
      throw new ForbiddenException(
        `Accès refusé - Rôle requis: ${requiredRoles.join(', ')}`
      );
    }

    return true;
  }
}