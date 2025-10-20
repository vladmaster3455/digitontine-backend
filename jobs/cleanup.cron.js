// jobs/cleanup.cron.js
const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const AuditLog = require('../models/AuditLog');
const ValidationRequest = require('../models/ValidationRequest');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Nettoyer les logs d'audit anciens (+ de 1 an)
 */
const cleanupOldAuditLogs = async () => {
  try {
    logger.info('CRON: Debut nettoyage logs audit');

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const result = await AuditLog.deleteMany({
      timestamp: { $lt: oneYearAgo },
    });

    logger.info(`Logs audit nettoyes: ${result.deletedCount} entrees supprimees`);
    return { deletedCount: result.deletedCount };
  } catch (error) {
    logger.error('Erreur nettoyage logs audit:', error);
    throw error;
  }
};

/**
 * Nettoyer les demandes de validation expirees (+ de 30 jours)
 */
const cleanupExpiredValidationRequests = async () => {
  try {
    logger.info('CRON: Debut nettoyage demandes validation');

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await ValidationRequest.deleteMany({
      status: { $in: ['expired', 'rejected', 'completed'] },
      createdAt: { $lt: thirtyDaysAgo },
    });

    logger.info(
      `Demandes validation nettoyees: ${result.deletedCount} entrees supprimees`
    );
    return { deletedCount: result.deletedCount };
  } catch (error) {
    logger.error('Erreur nettoyage demandes validation:', error);
    throw error;
  }
};

/**
 * Nettoyer les tokens FCM invalides
 */
const cleanupInvalidFCMTokens = async () => {
  try {
    logger.info('CRON: Debut nettoyage tokens FCM');

    const users = await User.find({ 'fcmTokens.0': { $exists: true } });

    let totalCleaned = 0;

    for (const user of users) {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const initialLength = user.fcmTokens.length;
      
      user.fcmTokens = user.fcmTokens.filter(
        (token) => token.lastUsed && token.lastUsed > sixMonthsAgo
      );

      if (user.fcmTokens.length < initialLength) {
        await user.save();
        totalCleaned += initialLength - user.fcmTokens.length;
      }
    }

    logger.info(`Tokens FCM nettoyes: ${totalCleaned} tokens obsoletes supprimes`);
    return { deletedCount: totalCleaned };
  } catch (error) {
    logger.error('Erreur nettoyage tokens FCM:', error);
    throw error;
  }
};

/**
 * Nettoyer les fichiers temporaires (+ de 7 jours)
 */
const cleanupTempFiles = async () => {
  try {
    logger.info('CRON: Debut nettoyage fichiers temporaires');

    const tempDir = path.join(__dirname, '../uploads/temp');
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    let deletedCount = 0;

    try {
      const files = await fs.readdir(tempDir);

      for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);

        if (stats.mtimeMs < sevenDaysAgo) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    logger.info(`Fichiers temporaires nettoyes: ${deletedCount} fichiers supprimes`);
    return { deletedCount };
  } catch (error) {
    logger.error('Erreur nettoyage fichiers temporaires:', error);
    throw error;
  }
};

/**
 * Nettoyer les recus anciens (+ de 2 ans)
 */
const cleanupOldReceipts = async () => {
  try {
    logger.info('CRON: Debut nettoyage anciens recus');

    const receiptsDir = path.join(__dirname, '../uploads/receipts');
    const twoYearsAgo = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000;

    let deletedCount = 0;

    try {
      const files = await fs.readdir(receiptsDir);

      for (const file of files) {
        const filePath = path.join(receiptsDir, file);
        const stats = await fs.stat(filePath);

        if (stats.mtimeMs < twoYearsAgo) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    logger.info(`Recus anciens nettoyes: ${deletedCount} fichiers supprimes`);
    return { deletedCount };
  } catch (error) {
    logger.error('Erreur nettoyage recus:', error);
    throw error;
  }
};

/**
 * Archiver les tontines terminees (+ de 6 mois)
 */
const archiveCompletedTontines = async () => {
  try {
    logger.info('CRON: Debut archivage tontines terminees');

    const Tontine = require('../models/Tontine');

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const tontinesAArchiver = await Tontine.find({
      statut: 'Terminee',
      dateCloture: { $lt: sixMonthsAgo },
      archived: { $ne: true },
    });

    let archivedCount = 0;

    for (const tontine of tontinesAArchiver) {
      tontine.archived = true;
      tontine.archivedAt = new Date();
      await tontine.save();
      archivedCount++;
    }

    logger.info(`Tontines archivees: ${archivedCount} tontines`);
    return { archivedCount };
  } catch (error) {
    logger.error('Erreur archivage tontines:', error);
    throw error;
  }
};

/**
 * Executer toutes les taches de nettoyage
 */
const runAllCleanupTasks = async () => {
  try {
    logger.info('CRON: Debut nettoyage complet');

    const results = {
      auditLogs: await cleanupOldAuditLogs(),
      validationRequests: await cleanupExpiredValidationRequests(),
      fcmTokens: await cleanupInvalidFCMTokens(),
      tempFiles: await cleanupTempFiles(),
      receipts: await cleanupOldReceipts(),
      tontines: await archiveCompletedTontines(),
    };

    logger.info('CRON: Nettoyage complet termine', results);
    return results;
  } catch (error) {
    logger.error('Erreur nettoyage complet:', error);
    throw error;
  }
};

/**
 * Initialiser les taches CRON de nettoyage
 */
const initializeCleanupJobs = () => {
  cron.schedule('0 2 * * 0', async () => {
    logger.info('Execution CRON: Nettoyage hebdomadaire complet');
    try {
      await runAllCleanupTasks();
    } catch (error) {
      logger.error('Erreur execution CRON nettoyage:', error);
    }
  });

  logger.info('CRON Nettoyage planifie: tous les dimanches a 02:00');

  cron.schedule('0 3 * * *', async () => {
    logger.info('Execution CRON: Nettoyage fichiers temporaires');
    try {
      await cleanupTempFiles();
    } catch (error) {
      logger.error('Erreur nettoyage fichiers temp:', error);
    }
  });

  logger.info('CRON Fichiers temp planifie: tous les jours a 03:00');
};

module.exports = {
  initializeCleanupJobs,
  runAllCleanupTasks,
  cleanupOldAuditLogs,
  cleanupExpiredValidationRequests,
  cleanupInvalidFCMTokens,
  cleanupTempFiles,
  cleanupOldReceipts,
  archiveCompletedTontines,
};