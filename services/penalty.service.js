// services/penalty.service.js
const Penalite = require('../models/Penalite');
const Transaction = require('../models/Transaction');
const Tontine = require('../models/Tontine');
const User = require('../models/User');
const emailService = require('./email.service');
const logger = require('../utils/logger');
const { TRANSACTION_STATUS } = require('../config/constants');

/**
 * Calculer les penalites pour une transaction en retard
 * US 4.6 : Calcul automatique des penalites
 */
const calculatePenalty = (montantCotisation, joursRetard, tauxPenalite, delaiGrace) => {
  try {
    // Pas de penalite pendant le delai de grace
    if (joursRetard <= delaiGrace) {
      return {
        montantPenalite: 0,
        joursFactures: 0,
        details: `Delai de grace (${delaiGrace} jours)`,
      };
    }

    const joursFactures = joursRetard - delaiGrace;

    // Calcul : (montant * taux%) par jour/semaine de retard
    // Exemple : 10000 FCFA * 5% = 500 FCFA par semaine
    const semainesRetard = Math.ceil(joursFactures / 7);
    const montantPenalite = Math.round(montantCotisation * (tauxPenalite / 100) * semainesRetard);

    return {
      montantPenalite,
      joursFactures,
      semainesRetard,
      tauxApplique: tauxPenalite,
      details: `${semainesRetard} semaine(s) x ${tauxPenalite}% = ${montantPenalite} FCFA`,
    };
  } catch (error) {
    logger.error('Erreur calcul penalite:', error);
    return {
      montantPenalite: 0,
      joursFactures: 0,
      error: error.message,
    };
  }
};

/**
 * Appliquer une penalite a une transaction
 */
const applyPenaltyToTransaction = async (transactionId) => {
  try {
    const transaction = await Transaction.findById(transactionId)
      .populate('userId', 'prenom nom email')
      .populate('tontineId', 'nom tauxPenalite delaiGrace');

    if (!transaction) {
      throw new Error('Transaction introuvable');
    }

    if (transaction.statut !== TRANSACTION_STATUS.EN_ATTENTE) {
      throw new Error('Seules les transactions en attente peuvent avoir des penalites');
    }

    const tontine = transaction.tontineId;
    const joursRetard = transaction.calculerRetard();

    if (joursRetard <= tontine.delaiGrace) {
      logger.info(`Transaction ${transactionId} - Pas de penalite (delai de grace)`);
      return null;
    }

    // Calculer penalite
    const penalityCalc = calculatePenalty(
      transaction.montantCotisation || transaction.montant,
      joursRetard,
      tontine.tauxPenalite,
      tontine.delaiGrace
    );

    if (penalityCalc.montantPenalite === 0) {
      return null;
    }

    // Verifier si penalite deja existante pour cette transaction
    const existingPenalty = await Penalite.findOne({
      transaction: transactionId,
      statut: 'Appliquee',
    });

    if (existingPenalty) {
      // Mettre a jour si montant change
      if (existingPenalty.montant !== penalityCalc.montantPenalite) {
        existingPenalty.montant = penalityCalc.montantPenalite;
        existingPenalty.joursRetard = joursRetard;
        existingPenalty.calculDetails = penalityCalc.details;
        await existingPenalty.save();

        logger.info(`Penalite mise a jour - Transaction ${transactionId}: ${penalityCalc.montantPenalite} FCFA`);
        return existingPenalty;
      }
      return existingPenalty;
    }

    // Creer nouvelle penalite
    const newPenalty = await Penalite.create({
      user: transaction.userId._id,
      tontine: transaction.tontineId._id,
      transaction: transactionId,
      montant: penalityCalc.montantPenalite,
      joursRetard,
      tauxApplique: tontine.tauxPenalite,
      calculDetails: penalityCalc.details,
      statut: 'Appliquee',
    });

    // Mettre a jour la transaction
    transaction.montantPenalite = penalityCalc.montantPenalite;
    transaction.joursRetard = joursRetard;
    await transaction.save();

    // Notifier l'utilisateur
    try {
      await emailService.sendEmail(
        transaction.userId.email,
        `Penalite appliquee - ${tontine.nom}`,
        `Bonjour ${transaction.userId.prenom},\n\nUne penalite de ${penalityCalc.montantPenalite} FCFA a ete appliquee a votre cotisation en retard.\n\nRetard : ${joursRetard} jours\nMontant cotisation : ${transaction.montantCotisation} FCFA\nPenalite : ${penalityCalc.montantPenalite} FCFA\nTotal a payer : ${transaction.montantCotisation + penalityCalc.montantPenalite} FCFA\n\n${penalityCalc.details}`
      );
    } catch (emailError) {
      logger.error('Erreur envoi email penalite:', emailError);
    }

    logger.info(`Penalite appliquee - Transaction ${transactionId}: ${penalityCalc.montantPenalite} FCFA`);
    return newPenalty;
  } catch (error) {
    logger.error('Erreur application penalite:', error);
    throw error;
  }
};

/**
 * Calculer toutes les penalites en attente pour une tontine
 */
const calculatePendingPenaltiesForTontine = async (tontineId) => {
  try {
    const tontine = await Tontine.findById(tontineId);
    if (!tontine) {
      throw new Error('Tontine introuvable');
    }

    // Trouver toutes les transactions en retard
    const transactionsEnRetard = await Transaction.find({
      tontineId,
      statut: TRANSACTION_STATUS.EN_ATTENTE,
      dateEcheance: { $lt: new Date() },
    }).populate('userId', 'prenom nom email');

    const results = {
      total: transactionsEnRetard.length,
      penalitesAppliquees: 0,
      montantTotal: 0,
      errors: [],
    };

    for (const transaction of transactionsEnRetard) {
      try {
        const penalty = await applyPenaltyToTransaction(transaction._id);
        if (penalty) {
          results.penalitesAppliquees++;
          results.montantTotal += penalty.montant;
        }
      } catch (error) {
        results.errors.push({
          transactionId: transaction._id,
          error: error.message,
        });
      }
    }

    logger.info(`Penalites calculees pour tontine ${tontine.nom}: ${results.penalitesAppliquees}/${results.total}`);
    return results;
  } catch (error) {
    logger.error('Erreur calcul penalites tontine:', error);
    throw error;
  }
};

/**
 * Calculer toutes les penalites en attente (toutes tontines)
 */
const calculateAllPendingPenalties = async () => {
  try {
    const tontinesActives = await Tontine.find({ statut: 'Active' });

    const globalResults = {
      tontinesTraitees: 0,
      totalPenalites: 0,
      montantTotalPenalites: 0,
      details: [],
    };

    for (const tontine of tontinesActives) {
      try {
        const result = await calculatePendingPenaltiesForTontine(tontine._id);
        globalResults.tontinesTraitees++;
        globalResults.totalPenalites += result.penalitesAppliquees;
        globalResults.montantTotalPenalites += result.montantTotal;
        globalResults.details.push({
          tontine: tontine.nom,
          ...result,
        });
      } catch (error) {
        logger.error(`Erreur tontine ${tontine.nom}:`, error);
      }
    }

    logger.info(`Calcul global penalites: ${globalResults.totalPenalites} penalites, ${globalResults.montantTotalPenalites} FCFA`);
    return globalResults;
  } catch (error) {
    logger.error('Erreur calcul global penalites:', error);
    throw error;
  }
};

/**
 * Exonerer une penalite (US 4.7)
 */
const exemptPenalty = async (penaliteId, exonerationData) => {
  try {
    const { exonerePar, raison } = exonerationData;

    const penalite = await Penalite.findById(penaliteId)
      .populate('user', 'prenom nom email')
      .populate('tontine', 'nom');

    if (!penalite) {
      throw new Error('Penalite introuvable');
    }

    if (penalite.statut !== 'Appliquee') {
      throw new Error('Seules les penalites appliquees peuvent etre exonerees');
    }

    penalite.statut = 'Exoneree';
    penalite.exonerationRaison = raison;
    penalite.exonerePar = exonerePar;
    penalite.dateExoneration = new Date();
    await penalite.save();

    // Mettre a jour la transaction
    const transaction = await Transaction.findById(penalite.transaction);
    if (transaction) {
      transaction.montantPenalite = 0;
      await transaction.save();
    }

    // Notifier l'utilisateur
    try {
      await emailService.sendEmail(
        penalite.user.email,
        `Exoneration de penalite - ${penalite.tontine.nom}`,
        `Bonjour ${penalite.user.prenom},\n\nVotre penalite de ${penalite.montant} FCFA a ete exoneree.\n\nRaison : ${raison}`
      );
    } catch (emailError) {
      logger.error('Erreur envoi email exoneration:', emailError);
    }

    logger.info(`Penalite ${penaliteId} exoneree par ${exonerePar}`);
    return penalite;
  } catch (error) {
    logger.error('Erreur exoneration penalite:', error);
    throw error;
  }
};

/**
 * Obtenir les statistiques des penalites pour un membre
 */
const getMemberPenaltyStats = async (userId) => {
  try {
    const stats = await Penalite.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: '$statut',
          count: { $sum: 1 },
          montantTotal: { $sum: '$montant' },
        },
      },
    ]);

    const result = {
      totalPenalites: 0,
      montantTotal: 0,
      appliquees: 0,
      montantApplique: 0,
      exonerees: 0,
      montantExonere: 0,
    };

    stats.forEach((stat) => {
      result.totalPenalites += stat.count;
      result.montantTotal += stat.montantTotal;

      if (stat._id === 'Appliquee') {
        result.appliquees = stat.count;
        result.montantApplique = stat.montantTotal;
      } else if (stat._id === 'Exoneree') {
        result.exonerees = stat.count;
        result.montantExonere = stat.montantTotal;
      }
    });

    return result;
  } catch (error) {
    logger.error('Erreur stats penalites membre:', error);
    throw error;
  }
};

/**
 * Obtenir les statistiques des penalites pour une tontine
 */
const getTontinePenaltyStats = async (tontineId) => {
  try {
    const stats = await Penalite.aggregate([
      { $match: { tontine: tontineId } },
      {
        $group: {
          _id: '$statut',
          count: { $sum: 1 },
          montantTotal: { $sum: '$montant' },
        },
      },
    ]);

    const totalMembers = await Penalite.distinct('user', { tontine: tontineId });

    const result = {
      totalPenalites: 0,
      montantTotal: 0,
      appliquees: 0,
      montantApplique: 0,
      exonerees: 0,
      montantExonere: 0,
      membresImpactes: totalMembers.length,
    };

    stats.forEach((stat) => {
      result.totalPenalites += stat.count;
      result.montantTotal += stat.montantTotal;

      if (stat._id === 'Appliquee') {
        result.appliquees = stat.count;
        result.montantApplique = stat.montantTotal;
      } else if (stat._id === 'Exoneree') {
        result.exonerees = stat.count;
        result.montantExonere = stat.montantTotal;
      }
    });

    return result;
  } catch (error) {
    logger.error('Erreur stats penalites tontine:', error);
    throw error;
  }
};

module.exports = {
  calculatePenalty,
  applyPenaltyToTransaction,
  calculatePendingPenaltiesForTontine,
  calculateAllPendingPenalties,
  exemptPenalty,
  getMemberPenaltyStats,
  getTontinePenaltyStats,
};