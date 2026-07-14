// backend/scripts/init-users.js
// Script pour initialiser les utilisateurs par défaut
// Exécuter avec: docker-compose exec backend node scripts/init-users.js

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// Configuration - Utiliser l'URI de connexion de Docker
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:spaye2024@mongodb:27017/spaye?authSource=admin';

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
  return `SPAYE-${crypto.randomBytes(16).toString('hex').toUpperCase()}`;
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

    // Vérifier si des utilisateurs existent déjà
    const existingCount = await User.countDocuments();
    if (existingCount > 0) {
      console.log(`ℹ️ ${existingCount} utilisateur(s) existent déjà dans la base.\n`);
      console.log('📋 UTILISATEURS EXISTANTS:');
      console.log('='.repeat(60));
      
      const existingUsers = await User.find().select('email role firstName lastName').lean();
      for (const user of existingUsers) {
        console.log(`   ${user.email} (${user.role}) - ${user.firstName} ${user.lastName}`);
      }
      console.log('='.repeat(60));
      console.log('\n❓ Voulez-vous continuer et ajouter les utilisateurs manquants ?');
      console.log('   Si vous voulez tout réinitialiser, exécutez: docker-compose exec mongodb mongosh -u admin -p spaye2024 --authenticationDatabase admin --eval "use spaye; db.users.drop();"\n');
    }

    let stats = { created: 0, updated: 0, skipped: 0, total: 0 };

    // Traiter chaque utilisateur
    for (const userData of DEFAULT_USERS) {
      console.log(`👤 Traitement de: ${userData.email} (${userData.role})`);

      try {
        // Vérifier si l'utilisateur existe
        let existing = await User.findOne({ email: userData.email });

        if (existing) {
          console.log(`   ⚠️ Existe déjà (${existing.role})`);
          stats.skipped++;
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
          balance: 1000000,
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
    console.log('   POST http://localhost:3000/api/auth/login');
    console.log('   { "email": "admin@spaye.com", "password": "admin@2026" }');
    console.log('='.repeat(60));

    await mongoose.disconnect();
    console.log('\n🔌 Déconnecté de MongoDB');
    process.exit(0);

  } catch (error) {
    console.error('❌ Erreur fatale:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

process.on('unhandledRejection', (error) => {
  console.error('❌ Erreur non gérée:', error);
  process.exit(1);
});

initUsers();