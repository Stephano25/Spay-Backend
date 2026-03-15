const { MongoClient, ObjectId } = require('mongodb');

async function checkUserWallet() {
  const uri = 'mongodb://localhost:27017';
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('✅ Connecté à MongoDB');
    
    const db = client.db('spaye');
    
    // ID de l'utilisateur connecté
    const userId = new ObjectId('69b12153c3216918219051c3');
    
    console.log(`🔍 Recherche du wallet pour l'utilisateur: ${userId}`);
    
    // Chercher le wallet
    const wallet = await db.collection('wallets').findOne({ userId });
    
    if (wallet) {
      console.log('✅ Wallet trouvé:');
      console.log('   ID:', wallet._id);
      console.log('   Balance:', wallet.balance, 'Ar');
      console.log('   Currency:', wallet.currency);
      console.log('   Daily Limit:', wallet.dailyLimit);
      console.log('   Monthly Limit:', wallet.monthlyLimit);
      console.log('   Is Active:', wallet.isActive);
      console.log('   Created At:', wallet.createdAt);
      console.log('   Updated At:', wallet.updatedAt);
    } else {
      console.log('❌ Aucun wallet trouvé pour cet utilisateur');
      
      // Vérifier si l'utilisateur existe
      const user = await db.collection('users').findOne({ _id: userId });
      if (user) {
        console.log('👤 Utilisateur trouvé:', user.email);
        console.log('   Balance dans users:', user.balance || 0, 'Ar');
      } else {
        console.log('❌ Utilisateur non trouvé');
      }
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await client.close();
  }
}

checkUserWallet();