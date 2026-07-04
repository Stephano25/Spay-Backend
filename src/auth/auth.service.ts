import { Injectable, ConflictException, UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
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
    private configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto) {
    const existingEmail = await this.userModel.findOne({ email: registerDto.email.toLowerCase() });
    if (existingEmail) {
      throw new ConflictException('Cet email est déjà utilisé');
    }

    if (registerDto.phoneNumber) {
      const existingPhone = await this.userModel.findOne({ phoneNumber: registerDto.phoneNumber });
      if (existingPhone) {
        throw new ConflictException('Ce numéro de téléphone est déjà utilisé');
      }
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    const qrCode = await this.generateUniqueQrCode();

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

    const access_token = this.signToken(user);

    return {
      access_token,
      user: this.toUserResponse(user),
    };
  }

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

    user.lastLogin = new Date();
    await user.save();

    const access_token = this.signToken(user);

    return {
      access_token,
      user: this.toUserResponse(user),
    };
  }

  async getProfile(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    return this.toUserResponse(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    if (!user.password) {
      throw new BadRequestException('Ce compte utilise Google OAuth, pas de mot de passe');
    }

    const matches = await bcrypt.compare(dto.currentPassword, user.password);
    if (!matches) {
      throw new BadRequestException('Mot de passe actuel incorrect');
    }

    user.password = await bcrypt.hash(dto.newPassword, 10);
    await user.save();

    return { message: 'Mot de passe modifié avec succès' };
  }

  async loginWithGoogle(googleUser: any) {
    const email = googleUser.email;
    const firstName = googleUser.firstName || '';
    const lastName = googleUser.lastName || '';
    const profilePicture = googleUser.picture || '';

    let user = await this.userModel.findOne({ email });
    
    if (!user) {
      const qrCode = await this.generateUniqueQrCode();
      user = new this.userModel({
        email,
        firstName,
        lastName,
        profilePicture,
        qrCode,
        balance: 0,
        role: UserRole.USER,
        isActive: true,
        lastLogin: new Date(),
        isGoogleUser: true,
      });
      await user.save();
    } else {
      user.lastLogin = new Date();
      if (!user.profilePicture && profilePicture) {
        user.profilePicture = profilePicture;
      }
      if (!user.isGoogleUser) {
        user.isGoogleUser = true;
      }
      await user.save();
    }

    const access_token = this.signToken(user);

    return {
      access_token,
      user: this.toUserResponse(user),
    };
  }

  async createAdminUser(email: string, password: string, firstName: string, lastName: string) {
    const existingUser = await this.userModel.findOne({ email });
    if (existingUser) {
      throw new ConflictException('Cet email est déjà utilisé');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const qrCode = await this.generateUniqueQrCode();

    const user = new this.userModel({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      qrCode,
      balance: 0,
      role: UserRole.ADMIN,
      isActive: true,
      lastLogin: new Date(),
    });

    await user.save();
    return this.toUserResponse(user);
  }

  async createSuperAdminUser(email: string, password: string, firstName: string, lastName: string) {
    const existingUser = await this.userModel.findOne({ email });
    if (existingUser) {
      throw new ConflictException('Cet email est déjà utilisé');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const qrCode = await this.generateUniqueQrCode();

    const user = new this.userModel({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      qrCode,
      balance: 0,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      lastLogin: new Date(),
    });

    await user.save();
    return this.toUserResponse(user);
  }

  private signToken(user: UserDocument): string {
    const secret = this.configService.get<string>('JWT_SECRET');
    
    if (!secret) {
      throw new Error('JWT_SECRET non configuré');
    }
    
    return this.jwtService.sign(
      {
        sub: user._id.toString(),
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
      },
      {
        secret: secret,
        expiresIn: '7d',
      }
    );
  }

  private async generateUniqueQrCode(): Promise<string> {
    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidate = `SPAYE-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
      const existing = await this.userModel.findOne({ qrCode: candidate });
      if (!existing) {
        return candidate;
      }
    }
    return `SPAYE-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
  }

  private toUserResponse(user: UserDocument) {
    return {
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      profilePicture: user.profilePicture,
      balance: user.balance || 0,
      qrCode: user.qrCode,
      friends: user.friends || [],
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      bio: user.bio,
      isGoogleUser: user.isGoogleUser || false,
    };
  }
}