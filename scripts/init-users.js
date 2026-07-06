// scripts/init-users.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

async function initUsers() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:spaye2024@mongodb:27017/spaye?authSource=admin';
    
    console.log(`🔗 Connexion à MongoDB: ${MONGODB_URI}`);
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
    });
    
    console.log('✅ Connecté à MongoDB');

    const userSchema = new mongoose.Schema({
      email: { type: String, required: true, unique: true },
      password: { type: String, required: true },
      firstName: { type: String, required: true },
      lastName: { type: String, required: true },
      phoneNumber: { type: String },
      balance: { type: Number, default: 0 },
      qrCode: { type: String, unique: true },
      role: { type: String, enum: ['user', 'admin', 'super_admin'], default: 'user' },
      isActive: { type: Boolean, default: true },
      isGoogleUser: { type: Boolean, default: false },
      createdAt: { type: Date, default: Date.now },
      lastLogin: { type: Date },
      profilePicture: { type: String },
      bio: { type: String },
      friends: { type: [String], default: [] },
    });

    const User = mongoose.model('User', userSchema);

    const users = [
      {
        email: 'superadmin@spaye.com',
        password: 'superadmin@2026',
        firstName: 'Super',
        lastName: 'Admin',
        role: 'super_admin',
        phoneNumber: '0340000001',
      },
      {
        email: 'admin@spaye.com',
        password: 'admin@2026',
        firstName: 'Admin',
        lastName: 'SPaye',
        role: 'admin',
        phoneNumber: '0340000002',
      },
      {
        email: 'user@spaye.com',
        password: 'user@2026',
        firstName: 'User',
        lastName: 'Test',
        role: 'user',
        phoneNumber: '0340000003',
      },
    ];

    async function generateUniqueQrCode() {
      const maxAttempts = 5;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidate = `SPAYE-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
        const existing = await User.findOne({ qrCode: candidate });
        if (!existing) {
          return candidate;
        }
      }
      return `SPAYE-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
    }

    let createdCount = 0;
    let updatedCount = 0;

    for (const userData of users) {
      console.log(`👤 Traitement de: ${userData.email}`);
      const existing = await User.findOne({ email: userData.email });

      if (existing) {
        if (existing.role !== userData.role) {
          existing.role = userData.role;
          await existing.save();
          console.log(`   ✅ Rôle mis à jour: ${userData.role}`);
          updatedCount++;
        } else {
          console.log(`   ⚠️ Existe déjà (${existing.role})`);
        }
        continue;
      }

      const hashedPassword = await bcrypt.hash(userData.password, 10);
      const qrCode = await generateUniqueQrCode();

      const user = new User({
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
        createdAt: new Date(),
      });

      await user.save();
      console.log(`   ✅ Créé (${userData.role})`);
      createdCount++;
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ INITIALISATION TERMINÉE');
    console.log('='.repeat(50));
    console.log(`📊 ${createdCount} créés, ${updatedCount} mis à jour`);
    console.log('\n📋 COMPTES DISPONIBLES:');
    console.log('='.repeat(50));
    console.log('🔑 SUPER ADMIN: superadmin@spaye.com / superadmin@2026');
    console.log('🔑 ADMIN: admin@spaye.com / admin@2026');
    console.log('👤 USER: user@spaye.com / user@2026');
    console.log('='.repeat(50));

    await mongoose.disconnect();
    console.log('\n🔌 Déconnecté de MongoDB');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

initUsers();