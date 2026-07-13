// scripts/init-users.js
// Script pour initialiser les utilisateurs par défaut
// Exécuter avec: npm run init-users

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://spaye_user:spaye2024@mongodb:27017/spaye?authSource=spaye';

// Définition du schéma User (simplifié pour l'init)
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phoneNumber: { type: String, unique: true, sparse: true },
  balance: { type: Number, default: 0 },
  qrCode: { type: String, unique: true, sparse: true },
  role: { type: String, enum: ['user', 'admin', 'super_admin'], default: 'user' },
  isActive: { type: Boolean, default: true },
  isGoogleUser: { type: Boolean, default: false },
  language: { type: String, enum: ['fr', 'en', 'mg'], default: 'fr' },
  profilePicture: { type: String, default: null },
  bio: { type: String, default: '' },
  friends: { type: [String], default: [] },
  lastLogin: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const User = mongoose.model('User', userSchema);

// Liste des utilisateurs à créer
const DEFAULT_USERS = [
  {
    email: 'superadmin@spaye.com',
    password: 'superadmin@2026',
    firstName: 'Super',
    lastName: 'Admin',
    role: 'super_admin',
    phoneNumber: '0340000001',
    language: 'fr',
    bio: 'Administrateur principal du système SPaye',
  },
  {
    email: 'admin@spaye.com',
    password: 'admin@2026',
    firstName: 'Admin',
    lastName: 'SPaye',
    role: 'admin',
    phoneNumber: '0340000002',
    language: 'fr',
    bio: 'Administrateur SPaye',
  },
  {
    email: 'user@spaye.com',
    password: 'user@2026',
    firstName: 'User',
    lastName: 'Test',
    role: 'user',
    phoneNumber: '0340000003',
    language: 'fr',
    bio: 'Utilisateur de test',
  },
  {
    email: 'test@gmail.com',
    password: 'Test@123',
    firstName: 'Test',
    lastName: 'Google',
    role: 'user',
    phoneNumber: '0340000004',
    language: 'en',
    bio: 'Test user with Gmail',
  },
];

/**
 * Génère un QR Code unique
 */
async function generateUniqueQrCode() {
  const maxAttempts = 10;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = `SPAYE-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    const existing = await User.findOne({ qrCode: candidate });
    if (!existing) {
      return candidate;
    }
  }
  // Fallback avec plus d'entropie
  return `SPAYE-${crypto.randomBytes(16).toString('hex').toUpperCase()}`;
}

/**
 * Formate le nombre avec séparateurs
 */
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Affiche le résumé final
 */
function printSummary(stats) {
  console.log('\n' + '='.repeat(60));
  console.log('✅ INITIALISATION TERMINÉE');
  console.log('='.repeat(60));
  console.log(`📊 ${stats.created} créé(s), ${stats.updated} mis à jour, ${stats.skipped} ignoré(s)`);
  console.log(`📝 Total utilisateurs: ${stats.total}`);
  console.log('');
  console.log('📋 COMPTES DISPONIBLES:');
  console.log('='.repeat(60));
  console.log('🔑 SUPER ADMIN: superadmin@spaye.com / superadmin@2026');
  console.log('🔑 ADMIN: admin@spaye.com / admin@2026');
  console.log('👤 USER: user@spaye.com / user@2026');
  console.log('👤 TEST: test@gmail.com / Test@123');
  console.log('='.repeat(60));
  console.log('💡 Pour vous connecter:');
  console.log('   POST /api/auth/login');
  console.log('   { "email": "admin@spaye.com", "password": "admin@2026" }');
  console.log('='.repeat(60));
}

/**
 * Fonction principale
 */
async function initUsers() {
  console.log('🚀 Démarrage de l\'initialisation des utilisateurs...');
  console.log(`📡 Connexion à MongoDB: ${MONGODB_URI}`);

  try {
    // Connexion à MongoDB
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4,
    });

    console.log('✅ Connecté à MongoDB\n');

    // Vérifier la connexion
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log(`📚 Collections disponibles: ${collections.map(c => c.name).join(', ')}\n`);

    let stats = { created: 0, updated: 0, skipped: 0, total: 0 };

    // Traiter chaque utilisateur
    for (const userData of DEFAULT_USERS) {
      console.log(`👤 Traitement de: ${userData.email} (${userData.role})`);

      try {
        // Vérifier si l'utilisateur existe
        let existing = await User.findOne({ email: userData.email });

        if (existing) {
          // Mettre à jour les informations si nécessaire
          let needsUpdate = false;
          const updates = {};

          // Vérifier les champs à mettre à jour
          if (existing.role !== userData.role) {
            updates.role = userData.role;
            needsUpdate = true;
          }
          if (existing.firstName !== userData.firstName) {
            updates.firstName = userData.firstName;
            needsUpdate = true;
          }
          if (existing.lastName !== userData.lastName) {
            updates.lastName = userData.lastName;
            needsUpdate = true;
          }
          if (existing.phoneNumber !== userData.phoneNumber) {
            updates.phoneNumber = userData.phoneNumber;
            needsUpdate = true;
          }
          if (existing.language !== (userData.language || 'fr')) {
            updates.language = userData.language || 'fr';
            needsUpdate = true;
          }
          if (existing.bio !== (userData.bio || '')) {
            updates.bio = userData.bio || '';
            needsUpdate = true;
          }

          if (needsUpdate) {
            updates.updatedAt = new Date();
            await User.updateOne({ email: userData.email }, { $set: updates });
            console.log(`   ✅ Mis à jour: ${Object.keys(updates).join(', ')}`);
            stats.updated++;
          } else {
            console.log(`   ⚠️ Existe déjà (${existing.role}) - Aucune mise à jour nécessaire`);
            stats.skipped++;
          }
          stats.total++;
          continue;
        }

        // Créer un nouvel utilisateur
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        const qrCode = await generateUniqueQrCode();

        const newUser = new User({
          email: userData.email,
          password: hashedPassword,
          firstName: userData.firstName,
          lastName: userData.lastName,
          phoneNumber: userData.phoneNumber,
          qrCode,
          balance: 0,
          role: userData.role,
          isActive: true,
          isGoogleUser: false,
          language: userData.language || 'fr',
          bio: userData.bio || '',
          friends: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await newUser.save();
        console.log(`   ✅ Créé avec succès (QR: ${qrCode})`);
        stats.created++;
        stats.total++;

      } catch (error) {
        if (error.code === 11000) {
          console.log(`   ⚠️ Conflit: ${userData.email} existe déjà (index unique)`);
          stats.skipped++;
        } else {
          console.log(`   ❌ Erreur: ${error.message}`);
        }
      }
    }

    // Afficher le résumé
    printSummary(stats);

    // Déconnexion
    await mongoose.disconnect();
    console.log('\n🔌 Déconnecté de MongoDB');
    process.exit(0);

  } catch (error) {
    console.error('❌ Erreur fatale:', error.message);
    if (error.code) {
      console.error(`   Code: ${error.code}`);
    }
    process.exit(1);
  }
}

// Gestion des erreurs non capturées
process.on('unhandledRejection', (error) => {
  console.error('❌ Erreur non gérée:', error);
  process.exit(1);
});

// Exécuter le script
initUsers();