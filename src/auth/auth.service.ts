import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../users/schemas/user.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

// Interface pour l'utilisateur avec timestamps
interface UserWithTimestamps extends User {
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
  ) {}

  async validateUser(payload: any): Promise<any> {
  console.log('🔍 Validation du payload:', payload);
  
  // Chercher l'utilisateur dans la base de données
  const user = await this.userModel.findById(payload.sub);
  
  if (user) {
    console.log('✅ Utilisateur trouvé:', user.email);
    return {
      userId: user._id,
      email: user.email,
      role: user.role
    };
  }
  
  console.log('❌ Utilisateur non trouvé');
  return null;
}

  /**
   * Inscription d'un nouvel utilisateur
   */
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
      role: 'user',
      isActive: true,
    });

    await newUser.save();

    // Convertir en objet JavaScript pour accéder à createdAt
    const userObject = newUser.toObject() as any;

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
        createdAt: userObject.createdAt || new Date(),
      }
    };
  }

  /**
   * Connexion d'un utilisateur
   */
  async login(loginDto: LoginDto) {
  const { email, password } = loginDto;
  
  console.log('🔍 Tentative login pour:', email);
  console.log('🔐 Mot de passe fourni:', password);
  
  // 1. Chercher l'utilisateur
  const user = await this.userModel.findOne({ email });
  
  if (!user) {
    console.log('❌ Utilisateur non trouvé');
    throw new UnauthorizedException('Email ou mot de passe incorrect');
  }
  
  console.log('✅ Utilisateur trouvé:', user.email);
  console.log('🔑 Hash en DB (longueur):', user.password.length);
  console.log('🔑 Hash en DB:', user.password.substring(0, 30) + '...');
  
  // 2. Vérifier le mot de passe
  const isPasswordValid = await bcrypt.compare(password, user.password);
  console.log('🔐 Mot de passe valide?', isPasswordValid);
  
  if (!isPasswordValid) {
    throw new UnauthorizedException('Email ou mot de passe incorrect');
  }
  
  // 3. Générer le token
  const payload = { email: user.email, sub: user._id, role: user.role };
  const token = this.jwtService.sign(payload);
  
  console.log('✅ Token généré:', token.substring(0, 20) + '...');
  
  return {
    access_token: token,
    user: {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role
    }
  };
}

  /**
   * Connexion avec Google (à implémenter)
   */
  async googleLogin(user: any) {
    throw new UnauthorizedException('Authentification Google non disponible pour le moment');
  }
}