// config/database.js
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    logger.info(` MongoDB connecté: ${conn.connection.host}`);
    logger.info(` Base de données: ${conn.connection.name}`);

    // Gestion des événements de connexion
    mongoose.connection.on('error', (err) => {
      logger.error(' Erreur MongoDB:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn(' MongoDB déconnecté');
    });

    // Fermeture propre lors de l'arrêt de l'app
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      logger.info(' MongoDB déconnecté suite à l\'arrêt de l\'application');
      process.exit(0);
    });

  } catch (error) {
    logger.error(' Erreur de connexion MongoDB:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;