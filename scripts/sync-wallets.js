// Connexion à MongoDB
const { MongoClient } = require('mongodb');

async function syncWallets() {
  const uri = 'mongodb://localhost:27017';
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('✅ Connecté à MongoDB');
    
    const db = client.db('spaye');
    const users = await db.collection('users').find().toArray();
    const transactions = db.collection('transactions');
    const wallets = db.collection('wallets');
    
    console.log(`📊 ${users.length} utilisateurs trouvés`);
    
    for (const user of users) {
      const userId = user._id;
      
      // Calculer le solde à partir des transactions
      const deposits = await transactions.aggregate([
        { 
          $match: { 
            receiverId: userId, 
            status: 'completed',
            type: { $in: ['deposit', 'transfer'] }
          } 
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).toArray();

      const withdrawals = await transactions.aggregate([
        { 
          $match: { 
            senderId: userId, 
            status: 'completed',
            type: { $in: ['withdrawal', 'transfer'] }
          } 
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).toArray();

      const totalDeposits = deposits.length > 0 ? deposits[0].total : 0;
      const totalWithdrawals = withdrawals.length > 0 ? withdrawals[0].total : 0;
      const calculatedBalance = totalDeposits - totalWithdrawals;
      
      // Mettre à jour ou créer le wallet
      const wallet = await wallets.findOne({ userId });
      
      if (wallet) {
        if (wallet.balance !== calculatedBalance) {
          await wallets.updateOne(
            { userId },
            { $set: { balance: calculatedBalance, updatedAt: new Date() } }
          );
          console.log(`✅ Wallet ${user.email} mis à jour: ${wallet.balance} → ${calculatedBalance} Ar`);
        }
      } else {
        await wallets.insertOne({
          userId,
          balance: calculatedBalance,
          currency: 'Ar',
          dailyLimit: 5000000,
          monthlyLimit: 50000000,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        console.log(`✅ Wallet créé pour ${user.email}: ${calculatedBalance} Ar`);
      }
    }
    
    console.log('🎉 Synchronisation terminée!');
    
  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await client.close();
  }
}

syncWallets();