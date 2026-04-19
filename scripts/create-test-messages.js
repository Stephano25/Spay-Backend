const { MongoClient, ObjectId } = require('mongodb');

async function createTestMessages() {
  const uri = 'mongodb://localhost:27017';
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('✅ Connecté à MongoDB');
    
    const db = client.db('spaye');
    
    // Récupérer les deux utilisateurs
    const user1 = await db.collection('users').findOne({ email: 'dazzremie@gmail.com' });
    const user2 = await db.collection('users').findOne({ email: 'nirinaremi.s@zurcher.edu.mg' });
    
    if (!user1 || !user2) {
      console.log('❌ Utilisateurs non trouvés');
      return;
    }
    
    console.log(`👤 User1: ${user1.email} (${user1._id})`);
    console.log(`👤 User2: ${user2.email} (${user2._id})`);
    
    // Messages de test
    const testMessages = [
      {
        senderId: user1._id,
        receiverId: user2._id,
        type: 'text',
        content: 'Salut Stephano ! Comment ça va ?',
        isRead: true,
        isDelivered: true,
        createdAt: new Date(Date.now() - 3600000 * 2), // 2 heures avant
        updatedAt: new Date(Date.now() - 3600000 * 2)
      },
      {
        senderId: user2._id,
        receiverId: user1._id,
        type: 'text',
        content: 'Salut Dazz ! Ça va bien, et toi ?',
        isRead: true,
        isDelivered: true,
        createdAt: new Date(Date.now() - 3600000 * 1.5), // 1.5 heures avant
        updatedAt: new Date(Date.now() - 3600000 * 1.5)
      },
      {
        senderId: user1._id,
        receiverId: user2._id,
        type: 'text',
        content: 'Super ! On se voit pour le projet ?',
        isRead: true,
        isDelivered: true,
        createdAt: new Date(Date.now() - 3600000), // 1 heure avant
        updatedAt: new Date(Date.now() - 3600000)
      },
      {
        senderId: user2._id,
        receiverId: user1._id,
        type: 'emoji',
        emoji: '👍',
        isRead: false,
        isDelivered: true,
        createdAt: new Date(Date.now() - 1800000), // 30 minutes avant
        updatedAt: new Date(Date.now() - 1800000)
      },
      {
        senderId: user1._id,
        receiverId: user2._id,
        type: 'text',
        content: 'RDV à 15h devant la bibliothèque',
        isRead: false,
        isDelivered: false,
        createdAt: new Date(Date.now() - 600000), // 10 minutes avant
        updatedAt: new Date(Date.now() - 600000)
      }
    ];
    
    // Insérer les messages
    for (const message of testMessages) {
      await db.collection('messages').insertOne(message);
      console.log(`✅ Message créé: ${message.content || message.emoji}`);
    }
    
    console.log(`\n🎉 ${testMessages.length} messages de test créés avec succès!`);
    
  } finally {
    await client.close();
  }
}

createTestMessages();