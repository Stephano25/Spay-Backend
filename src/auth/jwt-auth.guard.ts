import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    console.log('🛡️ [JWT Guard] canActivate called');
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    console.log('🛡️ [JWT Guard] handleRequest - user:', user);
    console.log('🛡️ [JWT Guard] handleRequest - err:', err);
    console.log('🛡️ [JWT Guard] handleRequest - info:', info);
    
    if (err || !user) {
      throw err || new UnauthorizedException('Non autorisé');
    }
    return user;
  }
}