import { Controller, Get, Put, Body, UseGuards, Req, Param, Query, Post, Delete } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('profile')
  async getProfile(@Req() req) {
    const userId = req.user.userId;
    return this.usersService.findById(userId);
  }

  @Put('profile')
  async updateProfile(@Req() req, @Body() updateData: any) {
    const userId = req.user.userId;
    return this.usersService.update(userId, updateData);
  }

  @Get('settings')
  async getUserSettings(@Req() req) {
    const userId = req.user.userId;
    return this.usersService.getUserSettings(userId);
  }

  @Put('settings')
  async updateUserSettings(@Req() req, @Body() settings: any) {
    const userId = req.user.userId;
    return this.usersService.updateUserSettings(userId, settings);
  }

  @Get('search')
  async searchUsers(@Query('q') query: string) {
    return this.usersService.search(query);
  }

  @Get('qr/:qrCode')
  async getUserByQRCode(@Param('qrCode') qrCode: string) {
    return this.usersService.findByQRCode(qrCode);
  }
}