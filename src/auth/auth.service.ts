import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../users/schemas/user.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, firstName, lastName, phoneNumber } = registerDto;

    const existingUser = await this.userModel.findOne({ email });
    if (existingUser) {
      throw new UnauthorizedException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const qrCode = `SPAYE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const user = new this.userModel({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      phoneNumber,
      qrCode,
      balance: 0,
      friends: [],
    });

    await user.save();

    const token = this.generateToken(user);

    return {
      user: this.sanitizeUser(user),
      token,
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.userModel.findOne({ email });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.generateToken(user);

    return {
      user: this.sanitizeUser(user),
      token,
    };
  }

  async googleLogin(userData: any) {
    let user = await this.userModel.findOne({ email: userData.email });

    if (!user) {
      user = new this.userModel({
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        profilePicture: userData.picture,
        isGoogleUser: true,
        googleId: userData.googleId,
        qrCode: `SPAYE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        balance: 0,
        friends: [],
      });
      await user.save();
    }

    const token = this.generateToken(user);

    return {
      user: this.sanitizeUser(user),
      token,
    };
  }

  private generateToken(user: UserDocument) {
    const payload = { sub: user._id, email: user.email };
    return this.jwtService.sign(payload);
  }

  private sanitizeUser(user: UserDocument) {
    return {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      profilePicture: user.profilePicture,
      balance: user.balance,
      qrCode: user.qrCode,
      friends: user.friends,
    };
  }

  async validateAdmin(email: string, password: string) {
    if (email === 'admin@spaye.com' && password === 'spaye@2026') {
      return {
        id: 'admin_default',
        email: 'admin@spaye.com',
        firstName: 'Admin',
        lastName: 'SPaye',
        role: 'super_admin'
      };
    }
    return null;
  }
}