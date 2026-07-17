import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req, Query, BadRequestException, Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FriendsService } from './friends.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  private readonly logger = new Logger(FriendsController.name);

  constructor(private friendsService: FriendsService) {}

  /**
   * ✅ Extrait l'userId de la requête avec vérification
   */
  private getUserId(req: any): string {
    // Vérifier que req.user existe
    if (!req.user) {
      this.logger.error('❌ req.user est undefined');
      throw new BadRequestException('Utilisateur non authentifié');
    }

    // Extraire l'userId
    const userId = req.user.userId || req.user.sub;
    
    if (!userId) {
      this.logger.error('❌ userId non trouvé dans req.user:', req.user);
      throw new BadRequestException('Utilisateur non authentifié: userId manquant');
    }

    // Vérifier que l'userId est valide (24 caractères hexadécimaux)
    if (typeof userId !== 'string' || userId.length !== 24) {
      this.logger.error(`❌ userId invalide: ${userId}`);
      throw new BadRequestException('ID utilisateur invalide');
    }

    this.logger.log(`✅ userId extrait: ${userId}`);
    return userId;
  }

  @Get()
  async getFriends(@Req() req) {
    const userId = this.getUserId(req);
    this.logger.log(`📋 [Controller] getFriends pour: ${userId}`);
    const result = await this.friendsService.getFriends(userId);
    this.logger.log(`📋 [Controller] ${result.length} amis trouvés`);
    return result;
  }

  @Get('blocked')
  async getBlockedUsers(@Req() req) {
    const userId = this.getUserId(req);
    this.logger.log(`🚫 [Controller] getBlockedUsers pour: ${userId}`);
    return this.friendsService.getBlockedUsers(userId);
  }

  @Get('requests')
  async getFriendRequests(@Req() req) {
    const userId = this.getUserId(req);
    this.logger.log(`📩 [Controller] getFriendRequests pour: ${userId}`);
    const result = await this.friendsService.getFriendRequests(userId);
    this.logger.log(`📩 [Controller] ${result.length} demandes trouvées`);
    return result;
  }

  @Get('suggestions')
  async getSuggestions(@Req() req) {
    const userId = this.getUserId(req);
    this.logger.log(`💡 [Controller] getSuggestions pour: ${userId}`);
    return this.friendsService.getSuggestions(userId);
  }

  @Get('search')
  async searchUsers(@Req() req, @Query('q') query: string) {
    const userId = this.getUserId(req);
    if (!query || query.length < 2) {
      return [];
    }
    this.logger.log(`🔍 [Controller] searchUsers: "${query}" pour: ${userId}`);
    return this.friendsService.searchUsers(query, userId);
  }

  @Get('block-status/:userId')
  async checkBlockStatus(@Req() req, @Param('userId') otherUserId: string) {
    const userId = this.getUserId(req);
    this.logger.log(`🔍 [Controller] checkBlockStatus: ${userId} vs ${otherUserId}`);
    return this.friendsService.checkBlockStatus(userId, otherUserId);
  }

  @Post('request/:friendId')
  async sendFriendRequest(@Req() req, @Param('friendId') friendId: string) {
    const userId = this.getUserId(req);
    
    if (!friendId || friendId.length !== 24) {
      throw new BadRequestException('ID utilisateur invalide');
    }

    // ✅ Vérifier que l'expéditeur n'est pas le même que le destinataire
    if (userId === friendId) {
      throw new BadRequestException('Vous ne pouvez pas vous ajouter vous-même');
    }

    this.logger.log(`📤 [Controller] sendFriendRequest: ${userId} -> ${friendId}`);
    const result = await this.friendsService.sendFriendRequest(userId, friendId);
    this.logger.log(`✅ [Controller] Résultat:`, result);
    return result;
  }

  @Post('accept/:requestId')
  async acceptFriendRequest(@Req() req, @Param('requestId') requestId: string) {
    const userId = this.getUserId(req);
    
    if (!requestId || requestId.length !== 24) {
      throw new BadRequestException('ID de demande invalide');
    }
    
    this.logger.log(`✅ [Controller] acceptFriendRequest: ${requestId} par ${userId}`);
    
    // ✅ Vérifier que la demande existe et que l'utilisateur est le destinataire
    const request = await this.friendsService.getFriendRequestById(requestId);
    if (!request) {
      this.logger.error(`❌ Demande non trouvée: ${requestId}`);
      throw new NotFoundException('Demande non trouvée');
    }
    
    this.logger.log(`📌 Demande trouvée: senderId=${request.senderId}, receiverId=${request.receiverId}`);
    
    // ✅ Vérifier que l'utilisateur est le destinataire
    if (request.receiverId !== userId) {
      this.logger.warn(`❌ Utilisateur ${userId} n'est pas le destinataire (${request.receiverId})`);
      throw new ForbiddenException('Vous n\'êtes pas autorisé à accepter cette demande');
    }
    
    const result = await this.friendsService.acceptFriendRequest(userId, requestId);
    return result;
  }

  @Post('decline/:requestId')
  async declineFriendRequest(@Req() req, @Param('requestId') requestId: string) {
    const userId = this.getUserId(req);
    if (!requestId || requestId.length !== 24) {
      throw new BadRequestException('ID de demande invalide');
    }
    this.logger.log(`❌ [Controller] declineFriendRequest: ${requestId} par ${userId}`);
    return this.friendsService.declineFriendRequest(userId, requestId);
  }

  @Post('block/:userId')
  async blockUser(@Req() req, @Param('userId') userToBlockId: string) {
    const userId = this.getUserId(req);
    if (!userToBlockId || userToBlockId.length !== 24) {
      throw new BadRequestException('ID utilisateur invalide');
    }
    this.logger.log(`🚫 [Controller] blockUser: ${userId} bloque ${userToBlockId}`);
    return this.friendsService.blockUser(userId, userToBlockId);
  }

  @Post('unblock/:userId')
  async unblockUser(@Req() req, @Param('userId') userToUnblockId: string) {
    const userId = this.getUserId(req);
    if (!userToUnblockId || userToUnblockId.length !== 24) {
      throw new BadRequestException('ID utilisateur invalide');
    }
    this.logger.log(`🔓 [Controller] unblockUser: ${userId} débloque ${userToUnblockId}`);
    return this.friendsService.unblockUser(userId, userToUnblockId);
  }

  @Delete(':friendId')
  async removeFriend(@Req() req, @Param('friendId') friendId: string) {
    const userId = this.getUserId(req);
    if (!friendId || friendId.length !== 24) {
      throw new BadRequestException('ID d\'ami invalide');
    }
    this.logger.log(`🗑️ [Controller] removeFriend: ${userId} supprime ${friendId}`);
    return this.friendsService.removeFriend(userId, friendId);
  }

  @Post('find-by-phones')
  async findUsersByPhones(@Req() req, @Body() body: { phones: string[] }) {
    const userId = this.getUserId(req);
    this.logger.log(`📱 [Controller] findUsersByPhones: ${body.phones?.length || 0} numéros`);
    return this.friendsService.findUsersByPhones(body.phones, userId);
  }
}