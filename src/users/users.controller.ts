import { Controller, Get, Put, Body, UseGuards, Req, Param, Query, Post, Delete, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import * as path from 'path';

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
    if (!query || query.length < 2) {
      return [];
    }
    return this.usersService.search(query);
  }

  @Get('qr/:qrCode')
  async getUserByQRCode(@Param('qrCode') qrCode: string) {
    return this.usersService.findByQRCode(qrCode);
  }

  @Post('upload-profile-picture')
  @UseInterceptors(FileInterceptor('profilePicture', {
    storage: diskStorage({
      destination: (req, file, cb) => {
        const uploadPath = path.join(process.cwd(), 'uploads', 'profiles');
        if (!fs.existsSync(uploadPath)) {
          fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = extname(file.originalname);
        cb(null, `profile-${uniqueSuffix}${ext}`);
      }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.match(/^image\/(jpeg|png|gif|webp)$/)) {
        return cb(new BadRequestException('Format de fichier non supporté'), false);
      }
      cb(null, true);
    }
  }))
  async uploadProfilePicture(@Req() req, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Aucun fichier uploadé');
    }
    
    const userId = req.user.userId;
    const profilePictureUrl = `/uploads/profiles/${file.filename}`;
    await this.usersService.updateProfilePicture(userId, profilePictureUrl);
    return { profilePictureUrl };
  }

  @Delete('profile-picture')
  async deleteProfilePicture(@Req() req) {
    const userId = req.user.userId;
    await this.usersService.deleteProfilePicture(userId);
    return { message: 'Photo supprimée avec succès' };
  }
}