import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { FriendsService } from './friends.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private friendsService: FriendsService) {}

  @Get()
  async getFriends(@Req() req) {
    const userId = req.user.userId;
    return this.friendsService.getFriends(userId);
  }

  @Get('requests')
  async getFriendRequests(@Req() req) {
    const userId = req.user.userId;
    return this.friendsService.getFriendRequests(userId);
  }

  @Get('suggestions')
  async getFriendSuggestions(@Req() req) {
    const userId = req.user.userId;
    return this.friendsService.getFriendSuggestions(userId);
  }

  @Get('status/:friendId')
  async getFriendStatus(@Req() req, @Param('friendId') friendId: string) {
    const userId = req.user.userId;
    return this.friendsService.getFriendStatus(userId, friendId);
  }

  @Post('request/:friendId')
  async sendFriendRequest(@Req() req, @Param('friendId') friendId: string) {
    const userId = req.user.userId;
    return this.friendsService.sendFriendRequest(userId, friendId);
  }

  @Post('accept/:requestId')
  async acceptFriendRequest(@Req() req, @Param('requestId') requestId: string) {
    const userId = req.user.userId;
    return this.friendsService.acceptFriendRequest(userId, requestId);
  }

  @Post('decline/:requestId')
  async declineFriendRequest(@Req() req, @Param('requestId') requestId: string) {
    const userId = req.user.userId;
    return this.friendsService.declineFriendRequest(userId, requestId);
  }

  @Delete(':friendId')
  async removeFriend(@Req() req, @Param('friendId') friendId: string) {
    const userId = req.user.userId;
    return this.friendsService.removeFriend(userId, friendId);
  }
}