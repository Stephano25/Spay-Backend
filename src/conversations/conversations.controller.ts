import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private conversationsService: ConversationsService) {}

  @Get()
  async getMyConversations(@Req() req) {
    const userId = req.user.userId;
    return this.conversationsService.getUserConversations(userId);
  }

  @Get(':id/messages')
  async getMessages(@Param('id') conversationId: string) {
    return this.conversationsService.getConversationMessages(conversationId);
  }

  @Post()
  async createConversation(@Body() body: { participants: string[] }) {
    return this.conversationsService.createConversation(body.participants);
  }

  @Post(':id/messages')
  async sendMessage(
    @Param('id') conversationId: string,
    @Req() req,
    @Body() body: { content: string; type?: string }
  ) {
    const senderId = req.user.userId;
    return this.conversationsService.sendMessage(
      conversationId,
      senderId,
      body.content,
      body.type || 'text'
    );
  }
}