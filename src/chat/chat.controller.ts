import { Controller, Get, Post, Body, Param, UseGuards, Req, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SendMessageDto } from './dto/message.dto';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Get('conversations')
  async getConversations(@Req() req) {
    const userId = req.user.userId;
    return this.chatService.getConversations(userId);
  }

  @Get('messages/:userId')
  async getMessages(@Req() req, @Param('userId') otherUserId: string) {
    const userId = req.user.userId;
    return this.chatService.getMessages(userId, otherUserId);
  }

  @Post('send')
  async sendMessage(@Req() req, @Body() sendMessageDto: SendMessageDto) {
    const userId = req.user.userId;
    return this.chatService.sendMessage(userId, sendMessageDto);
  }

  @Post('read/:senderId')
  async markAsRead(@Req() req, @Param('senderId') senderId: string) {
    const userId = req.user.userId;
    await this.chatService.markAsRead(userId, senderId);
    return { success: true };
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads',
      filename: (req, file, cb) => {
        const randomName = Array(32)
          .fill(null)
          .map(() => Math.round(Math.random() * 16).toString(16))
          .join('');
        cb(null, `${randomName}${extname(file.originalname)}`);
      },
    }),
    limits: {
      fileSize: 150 * 1024 * 1024, // 150 MB
    },
  }))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    return this.chatService.uploadFile(file);
  }
}