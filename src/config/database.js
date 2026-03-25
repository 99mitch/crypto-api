const mongoose = require('mongoose');
const config = require('./index');

async function connectDB() {
  try {
    await mongoose.connect(config.mongodb.uri);
    console.log('✅ MongoDB connecté');
  } catch (error) {
    console.error('❌ Erreur connexion MongoDB:', error.message);
    process.exit(1);
  }
}

module.exports = connectDB;
