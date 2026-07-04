import { Controller, Post, Body, UseGuards, Get, Req, Res } from '@nestjs/common';
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

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Redirection gérée par Passport
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req, @Res() res) {
    try {
      const user = req.user;
      
      if (!user) {
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=auth_failed`);
      }

      const result = await this.authService.loginWithGoogle(user);
      
      const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?token=${result.access_token}`;
      
      return res.redirect(redirectUrl);
    } catch (error) {
      console.error('❌ Erreur callback Google:', error);
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=server_error`);
    }
  }
}