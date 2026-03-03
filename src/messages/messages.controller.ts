import { Controller, Patch, Delete, Param, UseGuards } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private messagesService: MessagesService) {}

  @Patch(':id/read')
  async markAsRead(@Param('id') messageId: string) {
    await this.messagesService.markAsRead(messageId);
    return { success: true };
  }

  @Patch(':id/delivered')
  async markAsDelivered(@Param('id') messageId: string) {
    await this.messagesService.markAsDelivered(messageId);
    return { success: true };
  }

  @Delete(':id')
  async deleteMessage(@Param('id') messageId: string) {
    await this.messagesService.deleteMessage(messageId);
    return { success: true };
  }
}