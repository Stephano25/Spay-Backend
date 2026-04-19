const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');

async function createTestUsers() {
  const uri = 'mongodb://localhost:27017';
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('✅ Connecté à MongoDB');
    
    const db = client.db('spaye');
    
    // Mot de passe par défaut pour les tests
    const defaultPassword = 'password123';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    
    // Liste des utilisateurs de test
    const testUsers = [
      {
        email: 'dazzremie@gmail.com',
        password: hashedPassword,
        firstName: 'Dazz',
        lastName: 'Rémie',
        phoneNumber: '0340000001',
        role: 'user',
        isActive: true,
        balance: 1000000,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        email: 'nirinaremi.s@zurcher.edu.mg',
        password: hashedPassword,
        firstName: 'Stephano',
        lastName: 'NIRINA REMI',
        phoneNumber: '0340000002',
        role: 'user',
        isActive: true,
        balance: 500000,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
    
    for (const userData of testUsers) {
      // Vérifier si l'utilisateur existe déjà
      const existingUser = await db.collection('users').findOne({ email: userData.email });
      
      if (!existingUser) {
        // Générer un QR code unique
        const qrCode = `SPAYE-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
        userData.qrCode = qrCode;
        
        // Insérer l'utilisateur
        const result = await db.collection('users').insertOne(userData);
        console.log(`✅ Utilisateur créé: ${userData.email} avec ID: ${result.insertedId}`);
        
        // Créer un wallet pour l'utilisateur
        await db.collection('wallets').insertOne({
          userId: result.insertedId,
          balance: userData.balance,
          currency: 'Ar',
          dailyLimit: 5000000,
          monthlyLimit: 50000000,
          isActive: true,
          qrCode: qrCode,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        console.log(`✅ Wallet créé pour ${userData.email}`);
      } else {
        console.log(`ℹ️ Utilisateur déjà existant: ${userData.email}`);
      }
    }
    
    // Récupérer les IDs des deux utilisateurs
    const user1 = await db.collection('users').findOne({ email: 'dazzremie@gmail.com' });
    const user2 = await db.collection('users').findOne({ email: 'nirinaremi.s@zurcher.edu.mg' });
    
    if (user1 && user2) {
      // Vérifier s'ils sont déjà amis
      const existingFriend = await db.collection('friends').findOne({
        $or: [
          { userId: user1._id, friendId: user2._id },
          { userId: user2._id, friendId: user1._id }
        ]
      });
      
      if (!existingFriend) {
        // Créer une relation d'amitié
        await db.collection('friends').insertOne({
          userId: user1._id,
          friendId: user2._id,
          status: 'accepted',
          createdAt: new Date(),
          updatedAt: new Date()
        });
        console.log('✅ Relation d\'amitié créée entre les deux utilisateurs');
        
        // Mettre à jour les tableaux friends
        await db.collection('users').updateOne(
          { _id: user1._id },
          { $addToSet: { friends: user2._id.toString() } }
        );
        
        await db.collection('users').updateOne(
          { _id: user2._id },
          { $addToSet: { friends: user1._id.toString() } }
        );
        console.log('✅ Amis ajoutés aux tableaux friends');
      } else {
        console.log('ℹ️ Les utilisateurs sont déjà amis');
      }
      
      console.log('\n📊 Récapitulatif:');
      console.log(`👤 ${user1.email} (ID: ${user1._id})`);
      console.log(`👤 ${user2.email} (ID: ${user2._id})`);
      console.log('\n🔑 Mot de passe pour les deux: password123');
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await client.close();
  }
}

createTestUsers();