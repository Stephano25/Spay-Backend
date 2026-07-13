// auth/dto/register.dto.ts
import { IsEmail, IsString, MinLength, IsOptional, Matches, IsIn } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Email invalide' })
  email: string;

  @IsString()
  @MinLength(6, { message: 'Le mot de passe doit contenir au moins 6 caractères' })
  password: string;

  @IsString()
  @MinLength(2, { message: 'Le prénom doit contenir au moins 2 caractères' })
  firstName: string;

  @IsString()
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères' })
  lastName: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{9,10}$/, { message: 'Numéro de téléphone invalide (9-10 chiffres)' })
  phoneNumber?: string;

  @IsOptional()
  @IsIn(['fr', 'en', 'mg'], { message: 'Langue non supportée. Choisissez: fr, en, mg' })
  language?: string;
}