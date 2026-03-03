import { Controller, Post, Body, Get, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    const result = await this.authService.login(loginDto);
    console.log('📤 Réponse login:', result);
    return result;
  }

  @Get('google')
  async googleLogin() {
    // Rediriger vers Google OAuth
    return { message: 'Google login endpoint' };
  }

  @Get('google/callback')
  async googleCallback(@Req() req) {
    return this.authService.googleLogin(req.user);
  }
}