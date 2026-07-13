// scripts/generate-hash.js
const bcrypt = require('bcrypt');

const password = 'Admin123!';
const saltRounds = 10;

bcrypt.hash(password, saltRounds, (err, hash) => {
  if (err) {
    console.error('❌ Erreur:', err);
    process.exit(1);
  }
  console.log('✅ Hash généré avec succès!');
  console.log('📝 Mot de passe:', password);
  console.log('🔑 Hash:', hash);
  console.log('\n📌 Copiez ce hash dans mongo-init.js');
});