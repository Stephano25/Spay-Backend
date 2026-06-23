// src/auth/google.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private configService: ConfigService) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
      // 🔥 Ajout de ces options pour éviter les problèmes
      passReqToCallback: false,
      state: true,
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { name, emails, photos } = profile;
    
    console.log('📧 Email Google:', emails[0]?.value);
    console.log('👤 Nom:', name.givenName, name.familyName);
    
    const user = {
      email: emails[0].value,
      firstName: name.givenName || '',
      lastName: name.familyName || '',
      profilePicture: photos[0]?.value || '',
      accessToken,
    };
    
    done(null, user);
  }
}