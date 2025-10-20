// controllers/transaction.controller.js
const Transaction = require('../models/Transaction');
const Tontine = require('../models/Tontine');
const User = require('../models/User');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { getPaginationParams, generateTransactionId } = require('../utils/helpers');
const { TRANSACTION_STATUS, TRANSACTION_TYPES, ROLES, TONTINE_STATUS } = require('../config/constants');
const paymentService = require('../services/payment.service');
const penaltyService = require('../services/penalty.service');
const emailService = require('../services/email.service');

/**
 * @desc    Effectuer une cotisation (Membre)
 * @route   POST /digitontine/transactions
 * @access  Private (Membre)
 * 
 * US 4.1 : Effectuer une cotisation
 */
const createTransaction = async (req, res) => {
  try {
    const { tontineId, montant, moyenPaiement, echeanceNumero } = req.body;
    const user = req.user;

    // Vérifier que la tontine existe et est active
    const tontine = await Tontine.findById(tontineId);
    if (!tontine) {
      return ApiResponse.notFound(res, 'Tontine introuvable');
    }

    if (tontine.statut !== TONTINE_STATUS.ACTIVE) {
      return ApiResponse.error(res, 'La tontine n\'est pas active', 400);
    }

    // Vérifier que l'utilisateur est membre de cette tontine
    const isMembre = tontine.membres.some((m) => m.userId.toString() === user._id.toString());
    if (!isMembre) {
      return ApiResponse.forbidden(res, 'Vous ne faites pas partie de cette tontine');
    }

    // Générer référence unique
    const referenceTransaction = generateTransactionId();

    // Calculer pénalités si applicable
    let montantCotisation = montant;
    let montantPenalite = 0;
    let joursRetard = 0;
    let dateEcheance = null;

    if (echeanceNumero) {
      const echeance = tontine.calendrierCotisations.find(
        (e) => e.numeroEcheance === echeanceNumero
      );

      if (echeance) {
        dateEcheance = echeance.dateEcheance;
        montantCotisation = echeance.montant;

        // Calculer pénalité si en retard
        const penaltyData = await penaltyService.calculatePenalty({
          userId: user._id,
          tontineId,
          dateEcheance: echeance.dateEcheance,
          montantCotisation: echeance.montant,
        });

        if (penaltyData.hasPenalty) {
          montantPenalite = penaltyData.montantPenalite;
          joursRetard = penaltyData.joursRetardFacturables;
        }
      }
    }

    const montantTotal = montantCotisation + montantPenalite;

    // Créer la transaction
    const transaction = await Transaction.create({
      referenceTransaction,
      userId: user._id,
      tontineId,
      type: TRANSACTION_TYPES.COTISATION,
      montant: montantTotal,
      montantCotisation,
      montantPenalite,
      moyenPaiement,
      statut: TRANSACTION_STATUS.EN_ATTENTE,
      echeanceNumero,
      dateEcheance,
      joursRetard,
      metadata: {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    logger.info(
      `Transaction créée - ${referenceTransaction} - ${user.email} - ${montantTotal} FCFA`
    );

    // Initier le paiement selon le moyen choisi
    let paymentResult = null;

    if (moyenPaiement !== 'Cash') {
      paymentResult = await paymentService.initiatePayment(moyenPaiement, {
        amount: montantTotal,
        reference: referenceTransaction,
        phoneNumber: user.numeroTelephone,
        description: `Cotisation ${tontine.nom}`,
        userEmail: user.email,
        userName: user.nomComplet,
      });

      if (!paymentResult.success) {
        // Supprimer la transaction si échec initiation
        await transaction.deleteOne();
        return ApiResponse.error(res, paymentResult.error, 400);
      }

      // Mettre à jour la transaction avec les infos de paiement
      transaction.referencePaiement = paymentResult.paymentId || paymentResult.reference;
      transaction.webhookData = paymentResult;
      await transaction.save();
    }

    // Envoyer email de confirmation
    try {
      await emailService.sendPaymentReceipt(user, transaction, tontine);
    } catch (emailError) {
      logger.error('Erreur envoi reçu:', emailError);
    }

    return ApiResponse.success(
      res,
      {
        transaction: {
          id: transaction._id,
          reference: transaction.referenceTransaction,
          montant: transaction.montant,
          montantCotisation,
          montantPenalite,
          moyenPaiement: transaction.moyenPaiement,
          statut: transaction.statut,
          dateTransaction: transaction.dateTransaction,
        },
        payment: paymentResult
          ? {
              paymentUrl: paymentResult.paymentUrl,
              paymentId: paymentResult.paymentId,
              expiresAt: paymentResult.expiresAt,
            }
          : null,
      },
      'Transaction créée avec succès',
      201
    );
  } catch (error) {
    logger.error('Erreur createTransaction:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Valider une transaction (Trésorier)
 * @route   POST /digitontine/transactions/:transactionId/validate
 * @access  Trésorier
 * 
 * US 4.3 : Validation de paiement
 */
const validateTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { notes } = req.body;
    const tresorier = req.user;

    const transaction = await Transaction.findById(transactionId)
      .populate('userId', 'prenom nom email')
      .populate('tontineId', 'nom');

    if (!transaction) {
      return ApiResponse.notFound(res, 'Transaction introuvable');
    }

    if (transaction.statut !== TRANSACTION_STATUS.EN_ATTENTE) {
      return ApiResponse.error(
        res,
        `Transaction déjà ${transaction.statut.toLowerCase()}`,
        400
      );
    }

    // Valider
    transaction.statut = TRANSACTION_STATUS.VALIDEE;
    transaction.dateValidation = Date.now();
    transaction.validePar = tresorier._id;
    if (notes) transaction.notes = notes;
    await transaction.save();

    // Mettre à jour stats tontine
    const tontine = await Tontine.findById(transaction.tontineId);
    if (tontine) {
      await tontine.updateStats();
      await tontine.save();
    }

    logger.info(
      `Transaction validée - ${transaction.referenceTransaction} par ${tresorier.email}`
    );

    // Notifier le membre
    try {
      await emailService.sendPaymentValidatedNotification(
        transaction.userId,
        transaction,
        transaction.tontineId
      );
    } catch (emailError) {
      logger.error('Erreur notification:', emailError);
    }

    return ApiResponse.success(res, {
      transaction: {
        id: transaction._id,
        reference: transaction.referenceTransaction,
        statut: transaction.statut,
        dateValidation: transaction.dateValidation,
      },
    });
  } catch (error) {
    logger.error('Erreur validateTransaction:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Rejeter une transaction (Trésorier)
 * @route   POST /digitontine/transactions/:transactionId/reject
 * @access  Trésorier
 * 
 * US 4.3 : Rejet de paiement
 */
const rejectTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { motifRejet } = req.body;
    const tresorier = req.user;

    const transaction = await Transaction.findById(transactionId)
      .populate('userId', 'prenom nom email')
      .populate('tontineId', 'nom');

    if (!transaction) {
      return ApiResponse.notFound(res, 'Transaction introuvable');
    }

    if (transaction.statut !== TRANSACTION_STATUS.EN_ATTENTE) {
      return ApiResponse.error(res, 'Transaction déjà traitée', 400);
    }

    // Rejeter
    transaction.statut = TRANSACTION_STATUS.REJETEE;
    transaction.dateRejet = Date.now();
    transaction.validePar = tresorier._id;
    transaction.motifRejet = motifRejet;
    await transaction.save();

    logger.info(
      `Transaction rejetée - ${transaction.referenceTransaction} - Motif: ${motifRejet}`
    );

    // Notifier le membre
    try {
      await emailService.sendPaymentRejectedNotification(
        transaction.userId,
        transaction,
        motifRejet
      );
    } catch (emailError) {
      logger.error('Erreur notification:', emailError);
    }

    return ApiResponse.success(res, {
      transaction: {
        id: transaction._id,
        reference: transaction.referenceTransaction,
        statut: transaction.statut,
        motifRejet: transaction.motifRejet,
      },
    });
  } catch (error) {
    logger.error('Erreur rejectTransaction:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Liste des transactions (avec filtres)
 * @route   GET /digitontine/transactions
 * @access  Trésorier/Admin
 * 
 * US 4.4 : Suivi des transactions
 */
const listTransactions = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const {
      tontineId,
      userId,
      statut,
      type,
      moyenPaiement,
      dateDebut,
      dateFin,
      minMontant,
      maxMontant,
    } = req.query;

    // Construire la requête
    const query = {};

    if (tontineId) query.tontineId = tontineId;
    if (userId) query.userId = userId;
    if (statut) query.statut = statut;
    if (type) query.type = type;
    if (moyenPaiement) query.moyenPaiement = moyenPaiement;

    if (dateDebut || dateFin) {
      query.dateTransaction = {};
      if (dateDebut) query.dateTransaction.$gte = new Date(dateDebut);
      if (dateFin) query.dateTransaction.$lte = new Date(dateFin);
    }

    if (minMontant || maxMontant) {
      query.montant = {};
      if (minMontant) query.montant.$gte = parseInt(minMontant);
      if (maxMontant) query.montant.$lte = parseInt(maxMontant);
    }

    // Exécuter la requête
    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .populate('userId', 'prenom nom email')
        .populate('tontineId', 'nom')
        .populate('validePar', 'prenom nom')
        .sort({ dateTransaction: -1 })
        .limit(limit)
        .skip(skip),
      Transaction.countDocuments(query),
    ]);

    // Calculer totaux
    const totaux = await Transaction.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalMontant: { $sum: '$montant' },
          totalCotisations: {
            $sum: { $cond: [{ $eq: ['$type', 'cotisation'] }, '$montant', 0] },
          },
          totalPenalites: { $sum: '$montantPenalite' },
        },
      },
    ]);

    return ApiResponse.successWithPagination(
      res,
      transactions.map((t) => ({
        id: t._id,
        reference: t.referenceTransaction,
        user: t.userId ? t.userId.nomComplet : 'Inconnu',
        tontine: t.tontineId ? t.tontineId.nom : 'Inconnue',
        type: t.type,
        montant: t.montant,
        montantCotisation: t.montantCotisation,
        montantPenalite: t.montantPenalite,
        moyenPaiement: t.moyenPaiement,
        statut: t.statut,
        dateTransaction: t.dateTransaction,
        dateValidation: t.dateValidation,
      })),
      { page, limit, total },
      {
        totaux: totaux.length > 0 ? totaux[0] : null,
      }
    );
  } catch (error) {
    logger.error('Erreur listTransactions:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Détails d'une transaction
 * @route   GET /digitontine/transactions/:transactionId
 * @access  Private
 */
const getTransactionDetails = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const currentUser = req.user;

    const transaction = await Transaction.findById(transactionId)
      .populate('userId', 'prenom nom email numeroTelephone')
      .populate('tontineId', 'nom montantCotisation')
      .populate('validePar', 'prenom nom email');

    if (!transaction) {
      return ApiResponse.notFound(res, 'Transaction introuvable');
    }

    // Vérifier permissions (Admin, Trésorier ou soi-même)
    if (
      currentUser.role !== ROLES.ADMIN &&
      currentUser.role !== ROLES.TRESORIER &&
      transaction.userId._id.toString() !== currentUser._id.toString()
    ) {
      return ApiResponse.forbidden(res, 'Accès refusé');
    }

    return ApiResponse.success(res, {
      transaction: {
        id: transaction._id,
        reference: transaction.referenceTransaction,
        user: {
          id: transaction.userId._id,
          nom: transaction.userId.nomComplet,
          email: transaction.userId.email,
          telephone: transaction.userId.numeroTelephone,
        },
        tontine: {
          id: transaction.tontineId._id,
          nom: transaction.tontineId.nom,
        },
        type: transaction.type,
        montant: transaction.montant,
        montantCotisation: transaction.montantCotisation,
        montantPenalite: transaction.montantPenalite,
        moyenPaiement: transaction.moyenPaiement,
        referencePaiement: transaction.referencePaiement,
        statut: transaction.statut,
        dateTransaction: transaction.dateTransaction,
        dateValidation: transaction.dateValidation,
        dateRejet: transaction.dateRejet,
        validePar: transaction.validePar,
        motifRejet: transaction.motifRejet,
        echeanceNumero: transaction.echeanceNumero,
        dateEcheance: transaction.dateEcheance,
        joursRetard: transaction.joursRetard,
        createdAt: transaction.createdAt,
      },
    });
  } catch (error) {
    logger.error('Erreur getTransactionDetails:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Mes transactions (Membre)
 * @route   GET /digitontine/transactions/me
 * @access  Private (Membre)
 * 
 * US 4.9 : Consultation historique paiements
 */
const getMyTransactions = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const { tontineId, statut } = req.query;
    const user = req.user;

    const query = { userId: user._id };
    if (tontineId) query.tontineId = tontineId;
    if (statut) query.statut = statut;

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .populate('tontineId', 'nom montantCotisation')
        .sort({ dateTransaction: -1 })
        .limit(limit)
        .skip(skip),
      Transaction.countDocuments(query),
    ]);

    // Stats globales
    const stats = await Transaction.aggregate([
      { $match: { userId: user._id } },
      {
        $group: {
          _id: '$statut',
          count: { $sum: 1 },
          totalMontant: { $sum: '$montant' },
        },
      },
    ]);

    return ApiResponse.successWithPagination(
      res,
      transactions.map((t) => ({
        id: t._id,
        reference: t.referenceTransaction,
        tontine: t.tontineId ? t.tontineId.nom : 'Inconnue',
        montant: t.montant,
        montantPenalite: t.montantPenalite,
        moyenPaiement: t.moyenPaiement,
        statut: t.statut,
        dateTransaction: t.dateTransaction,
      })),
      { page, limit, total },
      { stats }
    );
  } catch (error) {
    logger.error('Erreur getMyTransactions:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Webhook Wave (callback paiement)
 * @route   POST /digitontine/transactions/webhook/wave
 * @access  Public (avec validation)
 */
const handleWaveWebhook = async (req, res) => {
  try {
    logger.info('Webhook Wave reçu:', req.body);

    const webhookData = await paymentService.processWaveWebhook(req.body);

    if (!webhookData.success) {
      return res.status(400).json({ error: 'Webhook invalide' });
    }

    // Trouver la transaction
    const transaction = await Transaction.findOne({
      referenceTransaction: webhookData.reference,
    }).populate('userId', 'prenom nom email');

    if (!transaction) {
      logger.warn(`Transaction introuvable pour webhook - Ref: ${webhookData.reference}`);
      return res.status(404).json({ error: 'Transaction introuvable' });
    }

    // Mettre à jour selon le statut
    if (webhookData.isPaid) {
      transaction.statut = TRANSACTION_STATUS.EN_ATTENTE; // Attend validation trésorier
      transaction.webhookReceived = true;
      transaction.webhookData = req.body;
      await transaction.save();

      logger.info(`Paiement Wave confirmé - ${transaction.referenceTransaction}`);

      // Notifier trésorier
      // TODO: Implémenter notification
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Erreur webhook Wave:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};

module.exports = {
  createTransaction,
  validateTransaction,
  rejectTransaction,
  listTransactions,
  getTransactionDetails,
  getMyTransactions,
  handleWaveWebhook,
};