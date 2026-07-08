// users/users.controller.ts - AJOUTER CES MÉTHODES

import { Controller, Get, Put, Body, UseGuards, Req, Param, Query, Post, Delete, UseInterceptors, UploadedFile, BadRequestException, Patch } from '@nestjs/common';
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

  // ============================================================
  // ✅ ENDPOINTS EXISTANTS - CONSERVER
  // ============================================================

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

  @Patch('settings')
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

  // ============================================================
  // ✅ NOUVEAUX ENDPOINTS POUR LE FRONTEND
  // ============================================================

  // ✅ GET /api/users/friends/count - Nombre d'amis
  @Get('friends/count')
  async getFriendsCount(@Req() req) {
    const userId = req.user.userId;
    return this.usersService.getFriendsCount(userId);
  }

  // ✅ GET /api/users/posts/count - Nombre de publications
  @Get('posts/count')
  async getPostsCount(@Req() req) {
    const userId = req.user.userId;
    return this.usersService.getPostsCount(userId);
  }

  // ✅ GET /api/users/friends - Liste des amis
  @Get('friends')
  async getFriends(@Req() req) {
    const userId = req.user.userId;
    return this.usersService.getFriends(userId);
  }

  // ✅ GET /api/users/friends/close - Amis proches
  @Get('friends/close')
  async getCloseFriends(@Req() req) {
    const userId = req.user.userId;
    return this.usersService.getCloseFriends(userId);
  }

  // ✅ GET /api/users/friends/acquaintances - Connaissances
  @Get('friends/acquaintances')
  async getAcquaintances(@Req() req) {
    const userId = req.user.userId;
    return this.usersService.getAcquaintances(userId);
  }

  // ✅ GET /api/users/friends/requests - Demandes d'amis en attente
  @Get('friends/requests')
  async getFriendRequests(@Req() req) {
    const userId = req.user.userId;
    return this.usersService.getFriendRequests(userId);
  }

  // ✅ GET /api/users/friends/blocked - Utilisateurs bloqués
  @Get('friends/blocked')
  async getBlockedUsers(@Req() req) {
    const userId = req.user.userId;
    return this.usersService.getBlockedUsers(userId);
  }

  // ✅ GET /api/users/friends/suggestions - Suggestions d'amis
  @Get('friends/suggestions')
  async getFriendSuggestions(@Req() req) {
    const userId = req.user.userId;
    return this.usersService.getFriendSuggestions(userId);
  }

  // ✅ GET /api/users/devices - Appareils connectés
  @Get('devices')
  async getDevices(@Req() req) {
    const userId = req.user.userId;
    return this.usersService.getDevices(userId);
  }

  // ✅ PATCH /api/users/email - Changer l'email
  @Patch('email')
  async changeEmail(@Req() req, @Body('email') email: string) {
    const userId = req.user.userId;
    return this.usersService.changeEmail(userId, email);
  }

  // ✅ PATCH /api/users/phone - Changer le téléphone
  @Patch('phone')
  async changePhone(@Req() req, @Body('phone') phone: string) {
    const userId = req.user.userId;
    return this.usersService.changePhone(userId, phone);
  }

  // ✅ POST /api/users/deactivate - Désactiver le compte
  @Post('deactivate')
  async deactivateAccount(@Req() req, @Body('password') password: string) {
    const userId = req.user.userId;
    return this.usersService.deactivateAccount(userId, password);
  }

  // ✅ DELETE /api/users/account - Supprimer le compte
  @Delete('account')
  async deleteAccount(@Req() req, @Body('password') password: string) {
    const userId = req.user.userId;
    return this.usersService.deleteAccount(userId, password);
  }

  // ✅ GET /api/users/data/download - Télécharger les données
  @Get('data/download')
  async downloadData(@Req() req) {
    const userId = req.user.userId;
    return this.usersService.downloadUserData(userId);
  }

  // ✅ POST /api/users/profile/photo - Upload photo de profil
  @Post('profile/photo')
  @UseInterceptors(FileInterceptor('photo', {
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
  }))
  async uploadProfilePhoto(@Req() req, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Aucun fichier uploadé');
    }
    const userId = req.user.userId;
    const url = `/uploads/profiles/${file.filename}`;
    await this.usersService.updateProfilePicture(userId, url);
    return { url };
  }

  // ✅ DELETE /api/users/profile/photo - Supprimer la photo de profil
  @Delete('profile/photo')
  async removeProfilePhoto(@Req() req) {
    const userId = req.user.userId;
    await this.usersService.deleteProfilePicture(userId);
    return { success: true };
  }

  // ✅ POST /api/users/report - Signaler un utilisateur
  @Post('report')
  async reportUser(@Req() req, @Body('userId') userId: string, @Body('reason') reason: string) {
    const reporterId = req.user.userId;
    return this.usersService.reportUser(reporterId, userId, reason);
  }

  // ✅ POST /api/users/friends/accept - Accepter une demande d'ami
  @Post('friends/accept')
  async acceptFriendRequest(@Req() req, @Body('requestId') requestId: string) {
    const userId = req.user.userId;
    return this.usersService.acceptFriendRequest(userId, requestId);
  }

  // ✅ POST /api/users/friends/reject - Refuser une demande d'ami
  @Post('friends/reject')
  async rejectFriendRequest(@Req() req, @Body('requestId') requestId: string) {
    const userId = req.user.userId;
    return this.usersService.rejectFriendRequest(userId, requestId);
  }

  // ✅ POST /api/users/friends/request - Envoyer une demande d'ami
  @Post('friends/request')
  async sendFriendRequest(@Req() req, @Body('userId') friendId: string) {
    const userId = req.user.userId;
    return this.usersService.sendFriendRequest(userId, friendId);
  }

  // ✅ DELETE /api/users/friends/:friendId - Supprimer un ami
  @Delete('friends/:friendId')
  async unfriend(@Req() req, @Param('friendId') friendId: string) {
    const userId = req.user.userId;
    return this.usersService.unfriend(userId, friendId);
  }

  // ✅ POST /api/users/friends/block - Bloquer un utilisateur
  @Post('friends/block')
  async blockUser(@Req() req, @Body('userId') userId: string) {
    const currentUserId = req.user.userId;
    return this.usersService.blockUser(currentUserId, userId);
  }

  // ✅ DELETE /api/users/friends/block/:userId - Débloquer un utilisateur
  @Delete('friends/block/:userId')
  async unblockUser(@Req() req, @Param('userId') userId: string) {
    const currentUserId = req.user.userId;
    return this.usersService.unblockUser(currentUserId, userId);
  }

  // ✅ DELETE /api/users/devices/:deviceId - Déconnecter un appareil
  @Delete('devices/:deviceId')
  async revokeDevice(@Req() req, @Param('deviceId') deviceId: string) {
    const userId = req.user.userId;
    return this.usersService.revokeDevice(userId, deviceId);
  }

  // ✅ POST /api/users/devices/logout-all - Déconnecter tous les appareils
  @Post('devices/logout-all')
  async logoutAllDevices(@Req() req) {
    const userId = req.user.userId;
    return this.usersService.logoutAllDevices(userId);
  }

  // ✅ PATCH /api/users/update-profile - Mettre à jour le profil
  @Patch('update-profile')
  async updateUserProfile(@Req() req, @Body() updateData: any) {
    const userId = req.user.userId;
    return this.usersService.updateProfile(userId, updateData);
  }
}