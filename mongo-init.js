// ============================================================
// MONGO INIT - SPaye
// ============================================================

db = db.getSiblingDB('spaye');

db.createUser({
  user: 'spaye_user',
  pwd: 'spaye2024',
  roles: [
    { role: 'readWrite', db: 'spaye' }
  ]
});

db.createCollection('users');
db.createCollection('transactions');
db.createCollection('messages');
db.createCollection('friends');
db.createCollection('wallets');
db.createCollection('settings');
db.createCollection('logs');

db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ phoneNumber: 1 }, { unique: true, sparse: true });
db.users.createIndex({ qrCode: 1 }, { unique: true, sparse: true });

db.transactions.createIndex({ senderId: 1, createdAt: -1 });
db.transactions.createIndex({ receiverId: 1, createdAt: -1 });
db.transactions.createIndex({ status: 1, createdAt: -1 });

db.messages.createIndex({ senderId: 1, receiverId: 1, createdAt: -1 });
db.friends.createIndex({ userId: 1, friendId: 1 }, { unique: true });

print('✅ MongoDB initialisé pour SPaye');