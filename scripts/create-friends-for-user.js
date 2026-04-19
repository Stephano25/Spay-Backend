const { MongoClient, ObjectId } = require('mongodb');

async function createFriendsForUser() {
  const uri = 'mongodb://localhost:27017';
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('✅ Connecté à MongoDB');
    
    const db = client.db('spaye');
    
    // 1. Récupérer l'utilisateur connecté (dazzremie@gmail.com)
    const currentUser = await db.collection('users').findOne({ 
      email: 'dazzremie@gmail.com' 
    });
    
    if (!currentUser) {
      console.log('❌ Utilisateur dazzremie@gmail.com non trouvé');
      return;
    }
    
    console.log(`👤 Utilisateur connecté: ${currentUser.email} (ID: ${currentUser._id})`);
    
    // 2. Récupérer les autres utilisateurs (Jean, Marie, etc.)
    const otherUsers = await db.collection('users').find({
      email: { $in: ['jean@example.com', 'marie@example.com'] }
    }).toArray();
    
    console.log(`👥 Autres utilisateurs trouvés: ${otherUsers.length}`);
    
    // 3. Créer des relations d'amitié avec chaque utilisateur
    for (const otherUser of otherUsers) {
      // Vérifier si la relation existe déjà
      const existingFriend = await db.collection('friends').findOne({
        $or: [
          { userId: currentUser._id, friendId: otherUser._id },
          { userId: otherUser._id, friendId: currentUser._id }
        ]
      });
      
      if (!existingFriend) {
        // Créer la relation d'amitié
        await db.collection('friends').insertOne({
          userId: currentUser._id,
          friendId: otherUser._id,
          status: 'accepted',
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        console.log(`✅ Amitié créée entre ${currentUser.email} et ${otherUser.email}`);
        
        // Ajouter aux tableaux friends des deux utilisateurs
        await db.collection('users').updateOne(
          { _id: currentUser._id },
          { $addToSet: { friends: otherUser._id.toString() } }
        );
        
        await db.collection('users').updateOne(
          { _id: otherUser._id },
          { $addToSet: { friends: currentUser._id.toString() } }
        );
      } else {
        console.log(`ℹ️ Amitié déjà existante entre ${currentUser.email} et ${otherUser.email}`);
      }
    }
    
    // 4. Vérifier le résultat
    const friends = await db.collection('friends').find({
      $or: [
        { userId: currentUser._id },
        { friendId: currentUser._id }
      ],
      status: 'accepted'
    }).toArray();
    
    console.log(`\n📊 Résultat: ${friends.length} ami(s) pour ${currentUser.email}`);
    
  } finally {
    await client.close();
  }
}

createFriendsForUser();