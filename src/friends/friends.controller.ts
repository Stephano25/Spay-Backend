import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req, Query } from '@nestjs/common';
import { FriendsService } from './friends.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private friendsService: FriendsService) {}

  @Get()
  async getFriends(@Req() req) {
    return this.friendsService.getFriends(req.user.userId);
  }

  @Get('blocked')
  async getBlockedUsers(@Req() req) {
    return this.friendsService.getBlockedUsers(req.user.userId);
  }

  @Get('requests')
  async getFriendRequests(@Req() req) {
    return this.friendsService.getFriendRequests(req.user.userId);
  }

  @Get('suggestions')
  async getSuggestions(@Req() req) {
    return this.friendsService.getSuggestions(req.user.userId);
  }

  @Get('search')
  async searchUsers(@Req() req, @Query('q') query: string) {
    return this.friendsService.searchUsers(query, req.user.userId);
  }

  @Get('block-status/:userId')
  async checkBlockStatus(@Req() req, @Param('userId') otherUserId: string) {
    return this.friendsService.checkBlockStatus(req.user.userId, otherUserId);
  }

  @Post('request/:friendId')
  async sendFriendRequest(@Req() req, @Param('friendId') friendId: string) {
    return this.friendsService.sendFriendRequest(req.user.userId, friendId);
  }

  @Post('accept/:requestId')
  async acceptFriendRequest(@Req() req, @Param('requestId') requestId: string) {
    return this.friendsService.acceptFriendRequest(req.user.userId, requestId);
  }

  @Post('decline/:requestId')
  async declineFriendRequest(@Req() req, @Param('requestId') requestId: string) {
    return this.friendsService.declineFriendRequest(req.user.userId, requestId);
  }

  @Post('block/:userId')
  async blockUser(@Req() req, @Param('userId') userToBlockId: string) {
    return this.friendsService.blockUser(req.user.userId, userToBlockId);
  }

  @Post('unblock/:userId')
  async unblockUser(@Req() req, @Param('userId') userToUnblockId: string) {
    return this.friendsService.unblockUser(req.user.userId, userToUnblockId);
  }

  @Delete(':friendId')
  async removeFriend(@Req() req, @Param('friendId') friendId: string) {
    return this.friendsService.removeFriend(req.user.userId, friendId);
  }
}