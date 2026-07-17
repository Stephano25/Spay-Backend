// backend/src/conversations/conversations.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req, Query, Patch } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Logger } from '@nestjs/common';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  private readonly logger = new Logger(ConversationsController.name);

  constructor(private conversationsService: ConversationsService) {}

  @Get()
  async getMyConversations(@Req() req) {
    const userId = req.user.userId;
    this.logger.log(`📋 GET /conversations pour ${userId}`);
    return this.conversationsService.getUserConversations(userId);
  }

  @Get(':id')
  async getConversation(@Param('id') conversationId: string, @Req() req) {
    const userId = req.user.userId;
    this.logger.log(`🔍 GET /conversations/${conversationId} pour ${userId}`);
    return this.conversationsService.getConversationById(conversationId, userId);
  }

  @Get(':id/messages')
  async getMessages(@Param('id') conversationId: string, @Req() req) {
    const userId = req.user.userId;
    this.logger.log(`📩 GET /conversations/${conversationId}/messages pour ${userId}`);
    
    // ✅ Vérifier que l'utilisateur a accès à la conversation
    await this.conversationsService.getConversationById(conversationId, userId);
    return this.conversationsService.getConversationMessages(conversationId);
  }

  @Post()
  async createConversation(@Body() body: { participants: string[] }, @Req() req) {
    const userId = req.user.userId;
    this.logger.log(`📝 POST /conversations par ${userId}`);
    
    // ✅ Ajouter l'utilisateur courant aux participants s'il n'y est pas
    let participants = body.participants;
    if (!participants.includes(userId)) {
      participants = [...participants, userId];
    }
    
    return this.conversationsService.createConversation(participants);
  }

  @Post('private')
  async createPrivateConversation(@Body() body: { otherUserId: string }, @Req() req) {
    const userId = req.user.userId;
    this.logger.log(`📝 POST /conversations/private entre ${userId} et ${body.otherUserId}`);
    
    return this.conversationsService.getOrCreatePrivateConversation(userId, body.otherUserId);
  }

  @Post('group')
  async createGroupConversation(
    @Body() body: { participants: string[]; groupName: string },
    @Req() req
  ) {
    const userId = req.user.userId;
    this.logger.log(`📝 POST /conversations/group "${body.groupName}" par ${userId}`);
    
    return this.conversationsService.createGroupConversation(
      body.participants,
      body.groupName,
      userId
    );
  }

  @Post(':id/messages')
  async sendMessage(
    @Param('id') conversationId: string,
    @Req() req,
    @Body() body: { content: string; type?: string }
  ) {
    const senderId = req.user.userId;
    this.logger.log(`📤 POST /conversations/${conversationId}/messages par ${senderId}`);
    
    return this.conversationsService.sendMessage(
      conversationId,
      senderId,
      body.content,
      body.type || 'text'
    );
  }

  @Patch(':id/read')
  async markAsRead(@Param('id') conversationId: string, @Req() req) {
    const userId = req.user.userId;
    this.logger.log(`📖 PATCH /conversations/${conversationId}/read par ${userId}`);
    
    await this.conversationsService.markMessagesAsRead(conversationId, userId);
    return { success: true, message: 'Messages marqués comme lus' };
  }

  @Get('unread/count')
  async getUnreadCount(@Req() req) {
    const userId = req.user.userId;
    this.logger.log(`📖 GET /conversations/unread/count pour ${userId}`);
    
    const count = await this.conversationsService.countUnreadMessages(userId);
    return { count };
  }

  @Get('unread/details')
  async getUnreadDetails(@Req() req) {
    const userId = req.user.userId;
    this.logger.log(`📖 GET /conversations/unread/details pour ${userId}`);
    
    return this.conversationsService.getUnreadMessagesByConversation(userId);
  }

  @Post(':id/participants')
  async addParticipant(
    @Param('id') conversationId: string,
    @Body() body: { userId: string },
    @Req() req
  ) {
    const userId = req.user.userId;
    this.logger.log(`➕ POST /conversations/${conversationId}/participants par ${userId}`);
    
    // ✅ Vérifier que l'utilisateur courant est admin ou participant
    await this.conversationsService.getConversationById(conversationId, userId);
    return this.conversationsService.addParticipant(conversationId, body.userId);
  }

  @Delete(':id/participants/:userId')
  async removeParticipant(
    @Param('id') conversationId: string,
    @Param('userId') userToRemoveId: string,
    @Req() req
  ) {
    const userId = req.user.userId;
    this.logger.log(`➖ DELETE /conversations/${conversationId}/participants/${userToRemoveId} par ${userId}`);
    
    // ✅ Vérifier que l'utilisateur courant est admin ou participant
    await this.conversationsService.getConversationById(conversationId, userId);
    return this.conversationsService.removeParticipant(conversationId, userToRemoveId);
  }
}