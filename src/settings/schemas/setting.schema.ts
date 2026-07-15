// src/settings/schemas/setting.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SettingDocument = Setting & Document;

@Schema({ timestamps: true })
export class Setting {
  // ============================================================
  // PARAMÈTRES GÉNÉRAUX
  // ============================================================
  @Prop({ type: Object, default: {} })
  general: {
    siteName: string;
    siteUrl: string;
    adminEmail: string;
    supportEmail: string;
    maintenanceMode: boolean;
    registrationEnabled: boolean;
    defaultUserRole: string;
    maxFileSize: number;
    sessionTimeout: number;
    defaultLanguage: string;
    supportedLanguages: string[];
  };

  // ============================================================
  // PARAMÈTRES DE SÉCURITÉ
  // ============================================================
  @Prop({ type: Object, default: {} })
  security: {
    twoFactorAuth: boolean;
    passwordMinLength: number;
    passwordRequireUppercase: boolean;
    passwordRequireNumbers: boolean;
    passwordRequireSpecial: boolean;
    maxLoginAttempts: number;
    lockoutDuration: number;
    sessionTimeout: number;
    requireEmailVerification: boolean;
    requirePhoneVerification: boolean;
    adminPasswordReset?: boolean; // ✅ Ajouté
    passwordResetTokenExpiry?: number; // ✅ Ajouté
  };

  // ============================================================
  // PARAMÈTRES DE PAIEMENT
  // ============================================================
  @Prop({ type: Object, default: {} })
  payment: {
    minTransaction: number;
    maxTransaction: number;
    dailyTransferLimit: number;
    monthlyTransferLimit: number;
    mobileMoneyEnabled: boolean;
    mobileMoneyOperators: {
      airtel: boolean;
      orange: boolean;
      mvola: boolean;
    };
    transferFees: {
      airtel: number;
      orange: number;
      mvola: number;
      internal: number;
    };
    currency: string;
    commissionRate?: number; // ✅ Ajouté
    maxCommission?: number; // ✅ Ajouté
  };

  // ============================================================
  // ✅ NOUVEAU: PARAMÈTRES DE NOTIFICATION
  // ============================================================
  @Prop({ type: Object, default: {} })
  notification: {
    emailNotifications: boolean;
    smsNotifications: boolean;
    pushNotifications: boolean;
    adminAlerts: {
      newUser: boolean;
      newTransaction: boolean;
      largeTransaction: boolean;
      securityAlert: boolean;
      systemError: boolean;
    };
    emailFrequency: 'instant' | 'hourly' | 'daily' | 'weekly';
  };

  // ============================================================
  // ✅ NOUVEAU: PARAMÈTRES DE PERSONNALISATION
  // ============================================================
  @Prop({ type: Object, default: {} })
  customization: {
    theme: 'light' | 'dark' | 'system';
    primaryColor: string;
    secondaryColor: string;
    logo?: string;
    favicon?: string;
    customCSS?: string;
    customJS?: string;
  };

  // ============================================================
  // ✅ NOUVEAU: PARAMÈTRES DE SÉCURITÉ AVANCÉE
  // ============================================================
  @Prop({ type: Object, default: {} })
  securityAdvanced: {
    apiKeys?: Record<string, string>;
    secrets?: Record<string, string>;
    smtpPassword?: string;
    jwtSecret?: string;
    encryptionKey?: string;
    rateLimit?: {
      enabled: boolean;
      maxRequests: number;
      timeWindow: number;
    };
  };

  // ============================================================
  // PARAMÈTRES DE LOGS
  // ============================================================
  @Prop({ type: Object, default: {} })
  logging: {
    enabled: boolean;
    level: 'debug' | 'info' | 'warn' | 'error';
    retentionDays: number;
    maxFileSize: number;
  };

  // ============================================================
  // PARAMÈTRES DE CACHAGE
  // ============================================================
  @Prop({ type: Object, default: {} })
  cache: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };
}

export const SettingSchema = SchemaFactory.createForClass(Setting);

// ✅ Ajouter des index pour les performances
SettingSchema.index({ createdAt: -1 });
SettingSchema.index({ updatedAt: -1 });