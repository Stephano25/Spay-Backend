import { Injectable, UnauthorizedException, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
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

  async validateUser(payload: any): Promise<any> {
    const user = await this.userModel.findById(payload.sub).select('-password');
    if (user) {
      return {
        userId: user._id,
        email: user.email,
        role: user.role,
      };
    }
    return null;
  }

  async getProfile(userId: string) {
    const user = await this.userModel.findById(userId).select('-password');
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    return user;
  }

  async register(registerDto: RegisterDto) {
    const { email, password, firstName, lastName, phoneNumber } = registerDto;

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await this.userModel.findOne({ email }).exec();
    if (existingUser) {
      throw new ConflictException('Un utilisateur avec cet email existe déjà');
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Générer un QR code unique
    const qrCode = `SPAYE-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

    // Créer le nouvel utilisateur
    const newUser = new this.userModel({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      phoneNumber,
      qrCode,
      balance: 0,
      friends: [],
      role: UserRole.USER,
      isActive: true,
    });

    await newUser.save();

    // Générer le token JWT
    const payload = { email: newUser.email, sub: newUser._id, role: newUser.role };
    
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: newUser._id.toString(),
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        phoneNumber: newUser.phoneNumber,
        balance: newUser.balance,
        qrCode: newUser.qrCode,
        role: newUser.role,
        isActive: newUser.isActive,
        createdAt: newUser.createdAt || new Date(),
      }
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;
    
    // Chercher l'utilisateur
    const user = await this.userModel.findOne({ email });
    
    if (!user) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }
    
    // Vérifier le mot de passe
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }
    
    // Vérifier si l'utilisateur est actif
    if (!user.isActive) {
      throw new UnauthorizedException('Votre compte est désactivé. Contactez l\'administrateur.');
    }
    
    // Mettre à jour la dernière connexion
    user.lastLogin = new Date();
    await user.save();
    
    // Générer le token
    const payload = { email: user.email, sub: user._id, role: user.role };
    const token = this.jwtService.sign(payload);
    
    return {
      access_token: token,
      user: {
        id: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        balance: user.balance,
        qrCode: user.qrCode,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt || new Date(),
        lastLogin: user.lastLogin,
      }
    };
  }

  // Méthode pour changer le mot de passe
  async changePassword(userId: string, changePasswordDto: ChangePasswordDto): Promise<{ message: string }> {
    const { currentPassword, newPassword } = changePasswordDto;
    
    // Chercher l'utilisateur avec son mot de passe
    const user = await this.userModel.findById(userId).select('+password');
    
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    
    // Vérifier le mot de passe actuel
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    
    if (!isPasswordValid) {
      throw new BadRequestException('Mot de passe actuel incorrect');
    }
    
    // Vérifier que le nouveau mot de passe est différent
    if (currentPassword === newPassword) {
      throw new BadRequestException('Le nouveau mot de passe doit être différent de l\'ancien');
    }
    
    // Hasher le nouveau mot de passe
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Mettre à jour le mot de passe
    user.password = hashedPassword;
    await user.save();
    
    return { message: 'Mot de passe modifié avec succès' };
  }

  async isAuthenticated(token: string): Promise<boolean> {
    try {
      const payload = this.jwtService.verify(token);
      const user = await this.userModel.findById(payload.sub);
      return !!user && user.isActive;
    } catch {
      return false;
    }
  }

  async isAdmin(userId: string): Promise<boolean> {
    const user = await this.userModel.findById(userId);
    return user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;
  }

  getTokenFromRequest(request: any): string | null {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return null;
  }
}