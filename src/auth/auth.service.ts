import { Injectable, ConflictException, UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User, UserDocument, UserRole } from '../users/schemas/user.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
  ) {}

  /**
   * Inscription d'un nouvel utilisateur
   */
  async register(registerDto: RegisterDto) {
    // Vérifier l'unicité de l'email
    const existingEmail = await this.userModel.findOne({ email: registerDto.email.toLowerCase() });
    if (existingEmail) {
      throw new ConflictException('Cet email est déjà utilisé');
    }

    // Vérifier l'unicité du téléphone si fourni
    if (registerDto.phoneNumber) {
      const existingPhone = await this.userModel.findOne({ phoneNumber: registerDto.phoneNumber });
      if (existingPhone) {
        throw new ConflictException('Ce numéro de téléphone est déjà utilisé');
      }
    }

    // Hachage du mot de passe
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Génération d'un QR code unique
    const qrCode = await this.generateUniqueQrCode();

    // Création de l'utilisateur
    const user = new this.userModel({
      email: registerDto.email.toLowerCase(),
      password: hashedPassword,
      firstName: registerDto.firstName,
      lastName: registerDto.lastName,
      phoneNumber: registerDto.phoneNumber,
      qrCode,
      balance: 0,
      role: UserRole.USER,
      isActive: true,
      lastLogin: new Date(),
    });

    await user.save();

    // Génération du token JWT
    const access_token = this.signToken(user);

    return {
      access_token,
      user: this.toUserResponse(user),
    };
  }

  /**
   * Connexion d'un utilisateur existant
   */
  async login(loginDto: LoginDto) {
    const user = await this.userModel.findOne({ email: loginDto.email.toLowerCase() });
    if (!user) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    const passwordMatches = await bcrypt.compare(loginDto.password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Ce compte a été désactivé');
    }

    // Mise à jour de la dernière connexion
    user.lastLogin = new Date();
    await user.save();

    const access_token = this.signToken(user);

    return {
      access_token,
      user: this.toUserResponse(user),
    };
  }

  /**
   * Récupération du profil utilisateur
   */
  async getProfile(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    return this.toUserResponse(user);
  }

  /**
   * Changement du mot de passe
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    const matches = await bcrypt.compare(dto.currentPassword, user.password);
    if (!matches) {
      throw new BadRequestException('Mot de passe actuel incorrect');
    }

    user.password = await bcrypt.hash(dto.newPassword, 10);
    await user.save();

    return { message: 'Mot de passe modifié avec succès' };
  }

  // ============================================================
  // Méthodes privées
  // ============================================================

  /**
   * Génère un token JWT pour l'utilisateur
   */
  private signToken(user: UserDocument): string {
    return this.jwtService.sign({
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    });
  }

  /**
   * Génère un QR code unique pour l'utilisateur
   * (avec plusieurs tentatives en cas de collision improbable)
   */
  private async generateUniqueQrCode(): Promise<string> {
    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidate = `SPAYE-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
      const existing = await this.userModel.findOne({ qrCode: candidate });
      if (!existing) {
        return candidate;
      }
    }
    // En cas d'échec après plusieurs tentatives, on génère un code plus long
    return `SPAYE-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
  }

  /**
   * Transforme un document utilisateur en objet de réponse (sans le mot de passe)
   */
  private toUserResponse(user: UserDocument) {
    return {
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      profilePicture: user.profilePicture,
      balance: user.balance,
      qrCode: user.qrCode,
      friends: user.friends || [],
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      bio: user.bio,
    };
  }
}