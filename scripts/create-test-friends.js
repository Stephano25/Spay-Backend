const { MongoClient, ObjectId } = require('mongodb');

async function createTestFriends() {
  const uri = 'mongodb://localhost:27017';
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('✅ Connecté à MongoDB');
    
    const db = client.db('spaye');
    
    // Récupérer deux utilisateurs
    const users = await db.collection('users').find().limit(2).toArray();
    
    if (users.length < 2) {
      console.log('❌ Pas assez d\'utilisateurs');
      return;
    }
    
    const user1 = users[0];
    const user2 = users[1];
    
    console.log(`👤 Utilisateur 1: ${user1.email}`);
    console.log(`👤 Utilisateur 2: ${user2.email}`);
    
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
      
      console.log('✅ Relation d\'amitié créée');
    } else {
      console.log('ℹ️ Ils sont déjà amis');
    }
    
    // Ajouter user2 aux amis de user1 dans le tableau friends
    await db.collection('users').updateOne(
      { _id: user1._id },
      { $addToSet: { friends: user2._id.toString() } }
    );
    
    await db.collection('users').updateOne(
      { _id: user2._id },
      { $addToSet: { friends: user1._id.toString() } }
    );
    
    console.log('✅ Amis ajoutés aux tableaux friends');
    
  } finally {
    await client.close();
  }
}

createTestFriends();