// jobs/penalty.cron.js
const cron = require('node-cron');
const penaltyService = require('../services/penalty.service');
const logger = require('../utils/logger');

/**
 * Calculer et appliquer les penalites pour toutes les tontines
 * US 4.6 : Calcul automatique des penalites
 */
const calculateAndApplyPenalties = async () => {
  try {
    logger.info('CRON: Debut calcul penalites');

    const results = await penaltyService.calculateAllPendingPenalties();

    logger.info(
      `CRON Penalites termine: ${results.totalPenalites} penalites appliquees pour ${results.montantTotalPenalites} FCFA sur ${results.tontinesTraitees} tontine(s)`
    );

    return results;
  } catch (error) {
    logger.error('Erreur CRON penalites:', error);
    throw error;
  }
};

/**
 * Initialiser la tache CRON de calcul des penalites
 * Execute tous les jours a minuit et midi
 */
const initializePenaltyJob = () => {
  cron.schedule('0 0,12 * * *', async () => {
    logger.info('Execution CRON: Calcul penalites');
    try {
      await calculateAndApplyPenalties();
    } catch (error) {
      logger.error('Erreur execution CRON penalites:', error);
    }
  });

  logger.info('CRON Penalites planifie: tous les jours a 00:00 et 12:00');
};

module.exports = {
  initializePenaltyJob,
  calculateAndApplyPenalties,
};