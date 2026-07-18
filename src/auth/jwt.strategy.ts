import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET') || 'spaye-secret-key-2024',
    });
  }

  async validate(payload: any) {
    console.log('📌 [JWT] Payload reçu:', JSON.stringify(payload, null, 2));

    // ✅ Récupérer l'userId du payload
    const userId = payload.userId || payload.sub || payload.id;
    if (!userId) {
      console.error('❌ [JWT] userId manquant dans le payload');
      throw new UnauthorizedException('Token invalide: userId manquant');
    }

    console.log(`✅ [JWT] userId extrait: ${userId}`);

    // ✅ Récupérer l'utilisateur pour vérifier qu'il existe
    const user = await this.usersService.findById(userId);
    if (!user) {
      console.error(`❌ [JWT] Utilisateur non trouvé: ${userId}`);
      throw new UnauthorizedException('Utilisateur non trouvé');
    }

    // ✅ IMPORTANT : on expose à la fois "id" et "userId" pointant
    // vers la même valeur, pour être compatible avec TOUT le code
    // existant (certains controllers lisent req.user.id, d'autres
    // req.user.userId).
    const result = {
      id: userId,
      userId: userId,
      email: payload.email || user.email,
      role: payload.role || user.role || 'user',
    };

    console.log(`✅ [JWT] User validated:`, JSON.stringify(result, null, 2));
    return result;
  }
}