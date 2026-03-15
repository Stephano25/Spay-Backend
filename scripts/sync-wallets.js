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
    let updatedCount = 0;
    let createdCount = 0;
    
    for (const user of users) {
      const userId = user._id;
      console.log(`\n👤 Traitement de l'utilisateur: ${user.email || user._id}`);
      
      // Récupérer toutes les transactions de l'utilisateur
      const userTransactions = await transactions.find({
        $or: [
          { senderId: userId },
          { receiverId: userId }
        ],
        status: 'completed'
      }).toArray();
      
      console.log(`   Transactions trouvées: ${userTransactions.length}`);
      
      // Calculer le solde à partir des transactions
      let calculatedBalance = 0;
      
      for (const tx of userTransactions) {
        // Si l'utilisateur est le destinataire (il reçoit de l'argent)
        if (tx.receiverId && tx.receiverId.toString() === userId.toString()) {
          calculatedBalance += tx.amount;
          console.log(`   ➕ Reçu: ${tx.amount} Ar (${tx.type})`);
        }
        // Si l'utilisateur est l'expéditeur (il envoie de l'argent)
        else if (tx.senderId && tx.senderId.toString() === userId.toString()) {
          calculatedBalance -= tx.amount;
          console.log(`   ➖ Envoyé: ${tx.amount} Ar (${tx.type})`);
        }
      }
      
      console.log(`   💰 Solde calculé: ${calculatedBalance} Ar`);
      
      // Chercher le wallet existant
      const existingWallet = await wallets.findOne({ userId });
      
      if (existingWallet) {
        // Mettre à jour le wallet existant
        if (existingWallet.balance !== calculatedBalance) {
          await wallets.updateOne(
            { userId },
            { 
              $set: { 
                balance: calculatedBalance, 
                updatedAt: new Date() 
              } 
            }
          );
          console.log(`   ✅ Wallet MIS À JOUR: ${existingWallet.balance} → ${calculatedBalance} Ar`);
          updatedCount++;
        } else {
          console.log(`   ℹ️ Wallet déjà à jour: ${calculatedBalance} Ar`);
        }
      } else {
        // Créer un nouveau wallet
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
        console.log(`   ✅ Wallet CRÉÉ: ${calculatedBalance} Ar`);
        createdCount++;
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log(`🎉 Synchronisation terminée!`);
    console.log(`📊 Statistiques:`);
    console.log(`   - Wallets mis à jour: ${updatedCount}`);
    console.log(`   - Wallets créés: ${createdCount}`);
    console.log(`   - Total utilisateurs: ${users.length}`);
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await client.close();
  }
}

// Exécuter la synchronisation
syncWallets().catch(console.error);