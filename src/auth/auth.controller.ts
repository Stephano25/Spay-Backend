// src/auth/auth.controller.ts
import { Controller, Post, Body, UseGuards, Get, Req, Res, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthGuard } from '@nestjs/passport';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req) {
    const userId = req.user.userId;
    return this.authService.getProfile(userId);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(@Req() req, @Body() changePasswordDto: ChangePasswordDto) {
    const userId = req.user.userId;
    return this.authService.changePassword(userId, changePasswordDto);
  }

  // ============================================================
  // Google OAuth - CORRIGÉ
  // ============================================================

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // La redirection est gérée par Passport
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req, @Res() res) {
    try {
      const user = req.user;
      console.log('👤 Utilisateur Google reçu:', user?.email);
      
      if (!user) {
        console.error('❌ Aucun utilisateur reçu de Google');
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=auth_failed`);
      }

      const token = await this.authService.loginWithGoogle(user);
      console.log('✅ Token généré pour:', user.email);
      
      // Rediriger vers le frontend avec le token
      const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?token=${token.access_token}`;
      console.log('🔀 Redirection vers:', redirectUrl);
      
      return res.redirect(redirectUrl);
    } catch (error) {
      console.error('❌ Erreur callback Google:', error);
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=server_error`);
    }
  }
}