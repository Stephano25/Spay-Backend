import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Patch,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { UsersService } from './users.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ============================================================
  // PROFIL
  // ============================================================

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  async getProfile(@Request() req) {
    const userId = req.user.id;
    return this.usersService.findById(userId);
  }

  @Put('profile')
  @UseGuards(AuthGuard('jwt'))
  async updateProfile(@Request() req, @Body() updateData: any) {
    const userId = req.user.id;
    return this.usersService.updateProfile(userId, updateData);
  }

  @Get('profile/:id')
  @UseGuards(AuthGuard('jwt'))
  async getProfileById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  // ============================================================
  // PHOTO DE PROFIL - UPLOAD CORRIGÉ
  // ============================================================

  @Post('upload-profile-picture')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(
    FileInterceptor('profilePicture', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadDir = join(process.cwd(), 'uploads', 'profiles');
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
            console.log(`📁 Dossier créé: ${uploadDir}`);
          }
          console.log(`📁 Destination d'upload: ${uploadDir}`);
          cb(null, uploadDir);
        },
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          const filename = `profile-${uniqueSuffix}${ext}`;
          console.log(`📄 Fichier créé: ${filename}`);
          cb(null, filename);
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
      fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic'];
        if (allowedTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          console.log(`❌ Type non autorisé: ${file.mimetype}`);
          cb(new BadRequestException(`Type de fichier non autorisé: ${file.mimetype}`), false);
        }
      },
    }),
  )
  async uploadProfilePicture(@Request() req, @UploadedFile() file: Express.Multer.File) {
    console.log('📸 Fichier reçu:', file?.originalname);
    console.log('📁 Chemin:', file?.path);
    console.log('📄 Type:', file?.mimetype);
    console.log('📏 Taille:', file?.size);

    if (!file) {
      throw new BadRequestException('Aucun fichier téléchargé');
    }

    const userId = req.user.id || req.user.userId;
    const fileUrl = `/uploads/profiles/${file.filename}`;
    console.log(`🔗 URL: ${fileUrl}`);

    const updatedUser = await this.usersService.updateProfilePicture(userId, fileUrl);

    return {
      success: true,
      message: 'Photo de profil mise à jour avec succès',
      profilePictureUrl: fileUrl,
      user: updatedUser,
    };
  }

  @Delete('profile-picture')
  @UseGuards(AuthGuard('jwt'))
  async deleteProfilePicture(@Request() req) {
    const userId = req.user.id;
    const result = await this.usersService.deleteProfilePicture(userId);
    return {
      success: true,
      message: 'Photo de profil supprimée',
      user: result,
    };
  }

  // ============================================================
  // PARAMÈTRES UTILISATEUR
  // ============================================================

  @Get('settings')
  @UseGuards(AuthGuard('jwt'))
  async getUserSettings(@Request() req) {
    const userId = req.user.id;
    return this.usersService.getUserSettings(userId);
  }

  @Patch('settings')
  @UseGuards(AuthGuard('jwt'))
  async updateUserSettings(@Request() req, @Body() settings: any) {
    const userId = req.user.id;
    return this.usersService.updateUserSettings(userId, settings);
  }

  // ============================================================
  // AMIS
  // ============================================================

  @Get('friends/count')
  @UseGuards(AuthGuard('jwt'))
  async getFriendsCount(@Request() req) {
    const userId = req.user.id;
    return this.usersService.getFriendsCount(userId);
  }

  @Get('posts/count')
  @UseGuards(AuthGuard('jwt'))
  async getPostsCount(@Request() req) {
    const userId = req.user.id;
    return this.usersService.getPostsCount(userId);
  }

  @Get('friends')
  @UseGuards(AuthGuard('jwt'))
  async getFriends(@Request() req) {
    const userId = req.user.id;
    return this.usersService.getFriends(userId);
  }

  @Get('friends/close')
  @UseGuards(AuthGuard('jwt'))
  async getCloseFriends(@Request() req) {
    const userId = req.user.id;
    return this.usersService.getCloseFriends(userId);
  }

  @Get('friends/acquaintances')
  @UseGuards(AuthGuard('jwt'))
  async getAcquaintances(@Request() req) {
    const userId = req.user.id;
    return this.usersService.getAcquaintances(userId);
  }

  @Get('friends/requests')
  @UseGuards(AuthGuard('jwt'))
  async getFriendRequests(@Request() req) {
    const userId = req.user.id;
    return this.usersService.getFriendRequests(userId);
  }

  @Get('friends/blocked')
  @UseGuards(AuthGuard('jwt'))
  async getBlockedUsers(@Request() req) {
    const userId = req.user.id;
    return this.usersService.getBlockedUsers(userId);
  }

  @Get('friends/suggestions')
  @UseGuards(AuthGuard('jwt'))
  async getFriendSuggestions(@Request() req) {
    const userId = req.user.id;
    return this.usersService.getFriendSuggestions(userId);
  }

  @Post('friends/accept/:requestId')
  @UseGuards(AuthGuard('jwt'))
  async acceptFriendRequest(@Request() req, @Param('requestId') requestId: string) {
    const userId = req.user.id;
    return this.usersService.acceptFriendRequest(userId, requestId);
  }

  @Post('friends/reject/:requestId')
  @UseGuards(AuthGuard('jwt'))
  async rejectFriendRequest(@Request() req, @Param('requestId') requestId: string) {
    const userId = req.user.id;
    return this.usersService.rejectFriendRequest(userId, requestId);
  }

  @Post('friends/request/:userId')
  @UseGuards(AuthGuard('jwt'))
  async sendFriendRequest(@Request() req, @Param('userId') friendId: string) {
    const userId = req.user.id;
    return this.usersService.sendFriendRequest(userId, friendId);
  }

  @Delete('friends/:friendId')
  @UseGuards(AuthGuard('jwt'))
  async unfriend(@Request() req, @Param('friendId') friendId: string) {
    const userId = req.user.id;
    return this.usersService.unfriend(userId, friendId);
  }

  @Post('friends/block/:userId')
  @UseGuards(AuthGuard('jwt'))
  async blockUser(@Request() req, @Param('userId') userId: string) {
    const currentUserId = req.user.id;
    return this.usersService.blockUser(currentUserId, userId);
  }

  @Post('friends/unblock/:userId')
  @UseGuards(AuthGuard('jwt'))
  async unblockUser(@Request() req, @Param('userId') userId: string) {
    const currentUserId = req.user.id;
    return this.usersService.unblockUser(currentUserId, userId);
  }

  // ============================================================
  // GESTION DU COMPTE
  // ============================================================

  @Patch('email')
  @UseGuards(AuthGuard('jwt'))
  async changeEmail(@Request() req, @Body('email') email: string) {
    const userId = req.user.id;
    return this.usersService.changeEmail(userId, email);
  }

  @Patch('phone')
  @UseGuards(AuthGuard('jwt'))
  async changePhoneNumber(@Request() req, @Body('phoneNumber') phone: string) {
    const userId = req.user.id;
    return this.usersService.changePhone(userId, phone);
  }

  @Post('deactivate')
  @UseGuards(AuthGuard('jwt'))
  async deactivateAccount(@Request() req, @Body('password') password: string) {
    const userId = req.user.id;
    return this.usersService.deactivateAccount(userId, password);
  }

  @Post('delete')
  @UseGuards(AuthGuard('jwt'))
  async deleteAccount(@Request() req, @Body('password') password: string) {
    const userId = req.user.id;
    return this.usersService.deleteAccount(userId, password);
  }

  @Get('export-data')
  @UseGuards(AuthGuard('jwt'))
  async downloadUserData(@Request() req) {
    const userId = req.user.id;
    return this.usersService.downloadUserData(userId);
  }

  // ============================================================
  // GESTION DES APPAREILS
  // ============================================================

  @Get('devices')
  @UseGuards(AuthGuard('jwt'))
  async getDevices(@Request() req) {
    const userId = req.user.id;
    return this.usersService.getDevices(userId);
  }

  @Delete('devices/:deviceId')
  @UseGuards(AuthGuard('jwt'))
  async revokeDevice(@Request() req, @Param('deviceId') deviceId: string) {
    const userId = req.user.id;
    return this.usersService.revokeDevice(userId, deviceId);
  }

  @Post('devices/logout-all')
  @UseGuards(AuthGuard('jwt'))
  async logoutAllDevices(@Request() req) {
    const userId = req.user.id;
    return this.usersService.logoutAllDevices(userId);
  }

  // ============================================================
  // SIGNALEMENT
  // ============================================================

  @Post('report/:userId')
  @UseGuards(AuthGuard('jwt'))
  async reportUser(@Request() req, @Param('userId') userId: string, @Body('reason') reason: string) {
    const reporterId = req.user.id;
    return this.usersService.reportUser(reporterId, userId, reason);
  }

  // ============================================================
  // RECHERCHE
  // ============================================================

  @Get('search')
  @UseGuards(AuthGuard('jwt'))
  async searchUsers(@Query('q') query: string) {
    if (!query || query.length < 2) {
      return [];
    }
    return this.usersService.search(query);
  }

  // ============================================================
  // ADMIN - Gestion des utilisateurs
  // ============================================================

  @Get()
  @UseGuards(AuthGuard('jwt'))
  async getAllUsers(@Request() req) {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      throw new BadRequestException('Accès refusé - Admin requis');
    }
    return this.usersService.findAll();
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  async getUserById(@Request() req, @Param('id') id: string) {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      throw new BadRequestException('Accès refusé - Admin requis');
    }
    return this.usersService.findById(id);
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt'))
  async updateUser(@Request() req, @Param('id') id: string, @Body() updateData: any) {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      throw new BadRequestException('Accès refusé - Admin requis');
    }
    return this.usersService.update(id, updateData);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  async deleteUser(@Request() req, @Param('id') id: string) {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      throw new BadRequestException('Accès refusé - Admin requis');
    }
    await this.usersService.delete(id);
    return { success: true, message: 'Utilisateur supprimé' };
  }

  @Post(':id/balance')
  @UseGuards(AuthGuard('jwt'))
  async updateBalance(@Request() req, @Param('id') id: string, @Body('amount') amount: number) {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      throw new BadRequestException('Accès refusé - Admin requis');
    }
    return this.usersService.updateBalance(id, amount);
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard('jwt'))
  async toggleUserStatus(@Request() req, @Param('id') id: string, @Body('isActive') isActive: boolean) {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      throw new BadRequestException('Accès refusé - Admin requis');
    }
    return this.usersService.toggleUserStatus(id, isActive);
  }

  @Patch(':id/language')
  @UseGuards(AuthGuard('jwt'))
  async updateUserLanguage(@Request() req, @Param('id') id: string, @Body('language') language: string) {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      throw new BadRequestException('Accès refusé - Admin requis');
    }
    return this.usersService.update(id, { language });
  }
}