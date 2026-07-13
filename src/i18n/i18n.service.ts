// src/i18n/i18n.service.ts
import { Injectable } from '@nestjs/common';

export type Language = 'fr' | 'en' | 'mg';

@Injectable()
export class I18nService {
  private translations: Record<Language, Record<string, string>> = {
    fr: {
      // Transactions
      'deposit.success': 'Dépôt de {amount} Ar effectué avec succès',
      'deposit.commission': 'Commission: {amount} Ar',
      'withdrawal.success': 'Retrait de {amount} Ar effectué avec succès',
      'withdrawal.commission': 'Commission: {amount} Ar',
      'transfer.success': 'Transfert de {amount} Ar effectué avec succès',
      'transfer.received': 'Vous avez reçu {amount} Ar de {sender}',
      'transfer.sent': 'Vous avez envoyé {amount} Ar à {receiver}',
      
      // Notifications
      'notification.balance_updated': 'Votre solde a été mis à jour',
      'notification.new_balance': 'Nouveau solde: {balance} Ar',
      'notification.deposit': 'Dépôt reçu',
      'notification.withdrawal': 'Retrait effectué',
      'notification.transfer': 'Transfert d\'argent',
      'notification.commission': 'Commission prélevée',
      
      // Admin
      'admin.deposit.success': 'Dépôt de {amount} Ar effectué sur le compte de {user}',
      'admin.withdrawal.success': 'Retrait de {amount} Ar effectué sur le compte de {user}',
      'admin.commission.collected': 'Commission de {amount} Ar collectée',
      
      // Erreurs
      'error.insufficient_balance': 'Solde insuffisant',
      'error.invalid_amount': 'Montant invalide',
      'error.user_not_found': 'Utilisateur non trouvé',
      'error.invalid_qr_code': 'QR Code invalide ou expiré',
      'error.unauthorized': 'Non autorisé',
      
      // Général
      'common.success': 'Succès',
      'common.error': 'Erreur',
      'common.confirm': 'Confirmer',
      'common.cancel': 'Annuler',
      'common.amount': 'Montant',
      'common.balance': 'Solde',
    },
    en: {
      // Transactions
      'deposit.success': 'Deposit of {amount} Ar successful',
      'deposit.commission': 'Commission: {amount} Ar',
      'withdrawal.success': 'Withdrawal of {amount} Ar successful',
      'withdrawal.commission': 'Commission: {amount} Ar',
      'transfer.success': 'Transfer of {amount} Ar successful',
      'transfer.received': 'You received {amount} Ar from {sender}',
      'transfer.sent': 'You sent {amount} Ar to {receiver}',
      
      // Notifications
      'notification.balance_updated': 'Your balance has been updated',
      'notification.new_balance': 'New balance: {balance} Ar',
      'notification.deposit': 'Deposit received',
      'notification.withdrawal': 'Withdrawal made',
      'notification.transfer': 'Money transfer',
      'notification.commission': 'Commission charged',
      
      // Admin
      'admin.deposit.success': 'Deposit of {amount} Ar made to {user}\'s account',
      'admin.withdrawal.success': 'Withdrawal of {amount} Ar made from {user}\'s account',
      'admin.commission.collected': 'Commission of {amount} Ar collected',
      
      // Erreurs
      'error.insufficient_balance': 'Insufficient balance',
      'error.invalid_amount': 'Invalid amount',
      'error.user_not_found': 'User not found',
      'error.invalid_qr_code': 'Invalid or expired QR Code',
      'error.unauthorized': 'Unauthorized',
      
      // Général
      'common.success': 'Success',
      'common.error': 'Error',
      'common.confirm': 'Confirm',
      'common.cancel': 'Cancel',
      'common.amount': 'Amount',
      'common.balance': 'Balance',
    },
    mg: {
      // Transactions
      'deposit.success': 'Fandoan-dra vola {amount} Ar vita soa',
      'deposit.commission': 'Komisiona: {amount} Ar',
      'withdrawal.success': 'Famoahana vola {amount} Ar vita soa',
      'withdrawal.commission': 'Komisiona: {amount} Ar',
      'transfer.success': 'Famindrana vola {amount} Ar vita soa',
      'transfer.received': 'Nahazo vola {amount} Ar avy amin\'i {sender} ianao',
      'transfer.sent': 'Nandefa vola {amount} Ar tany amin\'i {receiver} ianao',
      
      // Notifications
      'notification.balance_updated': 'Nohavaozina ny balance-nao',
      'notification.new_balance': 'Balance vaovao: {balance} Ar',
      'notification.deposit': 'Fandoan-dra vola voaray',
      'notification.withdrawal': 'Famoahana vola vita',
      'notification.transfer': 'Famindrana vola',
      'notification.commission': 'Komisiona nesorina',
      
      // Admin
      'admin.deposit.success': 'Natao ny fandoan-dra vola {amount} Ar tamin\'ny kaontin\'i {user}',
      'admin.withdrawal.success': 'Natao ny famoahana vola {amount} Ar tamin\'ny kaontin\'i {user}',
      'admin.commission.collected': 'Komisiona {amount} Ar voangona',
      
      // Erreurs
      'error.insufficient_balance': 'Tsy ampy ny balance',
      'error.invalid_amount': 'Tsy mety ny vola nampidirina',
      'error.user_not_found': 'Tsy hita ny mpampiasa',
      'error.invalid_qr_code': 'Tsy mety na lany daty ny QR Code',
      'error.unauthorized': 'Tsy nahazoana alalana',
      
      // Général
      'common.success': 'Vita soa',
      'common.error': 'Hadisoana',
      'common.confirm': 'Hamarina',
      'common.cancel': 'Hafoina',
      'common.amount': 'Vola',
      'common.balance': 'Balance',
    },
  };

  /**
   * Récupère la traduction d'une clé dans la langue spécifiée
   */
  translate(lang: Language, key: string, params?: Record<string, any>): string {
    const langTranslations = this.translations[lang] || this.translations['fr'];
    let text = langTranslations[key] || key;
    
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    
    return text;
  }

  /**
   * Récupère la traduction avec la langue par défaut 'fr'
   */
  t(key: string, params?: Record<string, any>): string {
    return this.translate('fr', key, params);
  }

  /**
   * Traduit un message avec la langue de l'utilisateur
   */
  getUserTranslation(userLang: string | undefined, key: string, params?: Record<string, any>): string {
    const lang = this.isValidLanguage(userLang) ? userLang as Language : 'fr';
    return this.translate(lang as Language, key, params);
  }

  /**
   * Vérifie si la langue est supportée
   */
  private isValidLanguage(lang?: string): boolean {
    return lang === 'fr' || lang === 'en' || lang === 'mg';
  }

  /**
   * Récupère toutes les langues supportées
   */
  getSupportedLanguages(): Language[] {
    return ['fr', 'en', 'mg'];
  }

  /**
   * Récupère le nom affichable d'une langue
   */
  getLanguageName(lang: Language): string {
    const names: Record<Language, string> = {
      fr: 'Français',
      en: 'English',
      mg: 'Malagasy',
    };
    return names[lang] || lang;
  }
}