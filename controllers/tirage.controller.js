// controllers/tirage.controller.js
const Tirage = require('../models/Tirage');
const Tontine = require('../models/Tontine');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const emailService = require('../services/email.service');
const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');
const ApiResponse = require('../utils/apiResponse');

/**
 * @desc    Effectuer un tirage automatique
 * @route   POST /digitontine/tirages/tontine/:tontineId/automatique
 * @access  Admin/Trésorier
 */
const effectuerTirageAutomatique = async (req, res, next) => {
  try {
    const { tontineId } = req.params;

    const tontine = await Tontine.findById(tontineId)
      .populate('membres.userId', 'prenom nom email numeroTelephone');

    if (!tontine) {
      throw new AppError('Tontine introuvable', 404);
    }

    if (tontine.statut !== 'Active') {
      throw new AppError('La tontine doit etre active', 400);
    }

    // Récupérer les tirages existants
    const tiragesExistants = await Tirage.find({ 
      tontineId, 
      statut: 'Effectue' 
    }).distinct('beneficiaire');

    // ✅ Appliquer opt-in automatique
    const maintenant = Date.now();
    const delaiMs = tontine.delaiOptIn * 60 * 1000;

    for (const membre of tontine.membres) {
      const aDejaGagne = tiragesExistants.some(t => t.equals(membre.userId._id));
      
      if (!aDejaGagne && membre.dateNotificationTirage) {
        const tempsEcoule = maintenant - membre.dateNotificationTirage.getTime();
        
        // Si délai dépassé ET pas encore confirmé → Opt-in automatique
        if (tempsEcoule >= delaiMs && !membre.participeTirage) {
          membre.participeTirage = true;
          membre.optInAutomatique = true;
          membre.dateOptIn = Date.now();
          
          logger.info(
            `✅ Opt-in automatique pour ${membre.userId.email} ` +
            `(délai ${tontine.delaiOptIn} min dépassé)`
          );
        }
      }
    }

    await tontine.save();

    // ✅ Filtrer les membres éligibles (n'ont pas encore gagné ET participent au tirage)
    const membresEligibles = tontine.membres.filter(
      m => !tiragesExistants.some(t => t.equals(m.userId._id)) 
        && m.participeTirage === true
    );

    if (membresEligibles.length === 0) {
      const membresNonGagnants = tontine.membres.filter(
        m => !tiragesExistants.some(t => t.equals(m.userId._id))
      );
      
      if (membresNonGagnants.length > 0) {
        throw new AppError(
          `Aucun membre eligible ne souhaite participer au tirage. ` +
          `${membresNonGagnants.length} membre(s) n'ont pas confirme leur participation.`,
          400
        );
      }
      
      throw new AppError('Tous les membres ont deja gagne', 400);
    }

    // Calculer le numéro d'échéance actuelle
    const echeanceActuelle = tiragesExistants.length + 1;

    // Vérifier les cotisations validées pour cette échéance
    const cotisationsValidees = await Transaction.aggregate([
      {
        $match: {
          tontineId: tontine._id,
          echeanceNumero: echeanceActuelle,
          statut: 'Validee',
          type: 'Cotisation'
        }
      },
      {
        $group: {
          _id: '$userId',
          count: { $sum: 1 }
        }
      }
    ]);

    const nombreMembresAyantCotise = cotisationsValidees.length;

    // Vérifier que tous les membres ont cotisé (mode STRICT)
    if (nombreMembresAyantCotise < tontine.membres.length) {
      logger.warn(
        `Cotisations incomplètes pour échéance ${echeanceActuelle}: ` +
        `${nombreMembresAyantCotise}/${tontine.membres.length} membres ont cotisé`
      );
      
      throw new AppError(
        `${nombreMembresAyantCotise}/${tontine.membres.length} cotisations validees. ` +
        `Tirage impossible. Tous les membres doivent avoir cotisé.`,
        400
      );
    }

    // Sélectionner un bénéficiaire au hasard parmi les membres éligibles
    const beneficiaire = membresEligibles[
      Math.floor(Math.random() * membresEligibles.length)
    ];

    const montantTotal = tontine.montantCotisation * tontine.membres.length;

    // Créer le tirage
    const nouveauTirage = await Tirage.create({
      tontineId,
      beneficiaireId: beneficiaire.userId._id,
      montant: montantTotal,
      dateEffective: new Date(),
      typeTirage: 'Automatique',
      statut: 'Effectue',
      effectuePar: req.user.id
    });

    await nouveauTirage.populate('beneficiaireId', 'prenom nom email numeroTelephone');

    // Créer un log d'audit
    await AuditLog.create({
      user: req.user.id,
      action: 'TIRAGE_EFFECTUE',
      details: {
        tirageId: nouveauTirage._id,
        tontineId,
        beneficiaire: beneficiaire.userId._id,
        montant: montantTotal,
        type: 'Automatique',
        echeanceNumero: echeanceActuelle,
        membresEligibles: membresEligibles.length
      },
      ipAddress: req.ip
    });

    // Envoyer notification au gagnant
    try {
      await emailService.sendTirageWinnerNotification(
        beneficiaire.userId,
        nouveauTirage,
        tontine
      );
    } catch (emailError) {
      logger.error('Erreur envoi email gagnant:', emailError);
    }

    // Notifier les autres membres
    const autresMembres = tontine.membres.filter(
      m => !m.userId._id.equals(beneficiaire.userId._id)
    );
    
    for (const membre of autresMembres) {
      try {
        await emailService.sendTirageResultNotification(
          membre.userId,
          nouveauTirage,
          tontine,
          beneficiaire.userId
        );
      } catch (emailError) {
        logger.error(`Erreur envoi email a ${membre.userId.email}:`, emailError);
      }
    }

    logger.info(
      `Tirage automatique effectue - Tontine: ${tontine.nom}, ` +
      `Gagnant: ${beneficiaire.userId.email}, Montant: ${montantTotal} FCFA`
    );

    return ApiResponse.success(res, {
      tirage: {
        id: nouveauTirage._id,
        beneficiaire: {
          id: beneficiaire.userId._id,
          nom: beneficiaire.userId.nomComplet,
          email: beneficiaire.userId.email
        },
        montant: nouveauTirage.montant,
        dateEffective: nouveauTirage.dateEffective,
        typeTirage: nouveauTirage.typeTirage,
        statut: nouveauTirage.statut
      },
      tontine: {
        id: tontine._id,
        nom: tontine.nom
      },
      details: {
        echeanceNumero: echeanceActuelle,
        membresEligibles: membresEligibles.length,
        membresAyantCotise: nombreMembresAyantCotise
      }
    }, 'Tirage effectue avec succes', 201);
  } catch (error) {
    next(error);
  }
};
/**
 * @desc    Notifier les membres avant un tirage
 * @route   POST /digitontine/tirages/tontine/:tontineId/notify
 * @access  Admin/Trésorier
 */
const notifyUpcomingTirage = async (req, res) => {
  try {
    const { tontineId } = req.params;
    const { dateTirage } = req.body;

    if (!dateTirage) {
      return ApiResponse.error(res, 'La date du tirage est requise', 400);
    }

    const tontine = await Tontine.findById(tontineId)
      .populate('membres.userId', 'prenom nom email');

    if (!tontine) {
      throw new AppError('Tontine introuvable', 404);
    }

    if (tontine.statut !== 'Active') {
      throw new AppError('La tontine doit etre active', 400);
    }

    const tiragesExistants = await Tirage.find({ 
      tontineId, 
      statut: 'Effectue' 
    }).distinct('beneficiaire');

    let notificationsSent = 0;

    // ✅ Envoyer notifications uniquement
    for (const membre of tontine.membres) {
      const aDejaGagne = tiragesExistants.some(t => t.equals(membre.userId._id));
      
      if (!aDejaGagne) {
        // ✅ Enregistrer la date de notification
        membre.dateNotificationTirage = Date.now();
        membre.participeTirage = false;  // Reset pour nouveau tirage
        membre.optInAutomatique = false; // Reset
        
        try {
          await emailService.sendTirageNotification(
            membre.userId, 
            tontine, 
            new Date(dateTirage),
            tontine.delaiOptIn
          );
          notificationsSent++;
        } catch (error) {
          logger.error(`Erreur notification pour ${membre.userId.email}:`, error);
        }
      }
    }

    // ✅ Sauvegarder une seule fois
    await tontine.save();

    logger.info(
      `Notifications tirage envoyees pour ${tontine.nom}: ${notificationsSent} membres notifies`
    );

    return ApiResponse.success(res, {
      message: `Notifications envoyees. Délai opt-in : ${tontine.delaiOptIn} minutes`,
      notificationsSent,
      delaiOptIn: tontine.delaiOptIn,
      dateExpiration: new Date(Date.now() + tontine.delaiOptIn * 60 * 1000)
    });
  } catch (error) {
    logger.error('Erreur notification tirage:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Effectuer un tirage manuel
 * @route   POST /digitontine/tirages/tontine/:tontineId/manuel
 * @access  Admin
 */
const effectuerTirageManuel = async (req, res, next) => {
  try {
    const { tontineId } = req.params;
    const { beneficiaireId, raison } = req.body;

    if (!beneficiaireId) {
      throw new AppError('Beneficiaire requis', 400);
    }

    const tontine = await Tontine.findById(tontineId)
      .populate('membres.userId', 'prenom nom email numeroTelephone');

    if (!tontine) {
      throw new AppError('Tontine introuvable', 404);
    }

    if (tontine.statut !== 'Active') {
      throw new AppError('La tontine doit etre active', 400);
    }

    const estMembre = tontine.membres.some(
      m => m.userId._id.toString() === beneficiaireId.toString()
    );
    
    if (!estMembre) {
      throw new AppError('Le beneficiaire doit etre membre de la tontine', 400);
    }

    const aDejaGagne = await Tirage.exists({
      tontineId,
      beneficiaire: beneficiaireId,
      statut: 'Effectue'
    });

    if (aDejaGagne) {
      throw new AppError('Ce membre a deja gagne', 400);
    }

    const montantTotal = tontine.montantCotisation * tontine.membres.length;

    const nouveauTirage = await Tirage.create({
      tontineId,
      beneficiaire: beneficiaireId,
      montant: montantTotal,
      dateEffective: new Date(),
      typeTirage: 'Manuel',
      statut: 'Effectue',
      effectuePar: req.user.id,
      raisonManuelle: raison || 'Tirage manuel administrateur'
    });

    await nouveauTirage.populate('beneficiaire', 'prenom nom email numeroTelephone');

    await AuditLog.create({
      user: req.user.id,
      action: 'TIRAGE_MANUEL',
      details: {
        tirageId: nouveauTirage._id,
        tontineId,
        beneficiaire: beneficiaireId,
        montant: montantTotal,
        raison
      },
      ipAddress: req.ip
    });

    const beneficiaire = await User.findById(beneficiaireId);
    
    try {
      await emailService.sendTirageWinnerNotification(
        beneficiaire,
        nouveauTirage,
        tontine
      );
    } catch (emailError) {
      logger.error('Erreur envoi email:', emailError);
    }

    return ApiResponse.success(res, nouveauTirage, 'Tirage manuel effectue', 201);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Annuler un tirage
 * @route   PUT /digitontine/tirages/:tirageId/annuler
 * @access  Admin
 */
const annulerTirage = async (req, res, next) => {
  try {
    const { tirageId } = req.params;
    const { raison } = req.body;

    if (!raison || raison.trim().length < 10) {
      throw new AppError('Raison d\'annulation requise (min 10 caracteres)', 400);
    }

    const tirage = await Tirage.findById(tirageId);
    if (!tirage) {
      throw new AppError('Tirage introuvable', 404);
    }

    if (tirage.statut === 'Annule') {
      throw new AppError('Tirage deja annule', 400);
    }

    tirage.statut = 'Annule';
    tirage.raisonAnnulation = raison;
    tirage.annulePar = req.user.id;
    tirage.dateAnnulation = new Date();
    await tirage.save();

    await AuditLog.create({
      user: req.user.id,
      action: 'TIRAGE_ANNULE',
      details: {
        tirageId,
        tontineId: tirage.tontineId,
        beneficiaire: tirage.beneficiaire,
        raison
      },
      ipAddress: req.ip
    });

    const beneficiaire = await User.findById(tirage.beneficiaire);
    const tontine = await Tontine.findById(tirage.tontineId);

    if (beneficiaire && tontine) {
      try {
        await emailService.sendEmail(
          beneficiaire.email,
          'Annulation de tirage',
          `Bonjour ${beneficiaire.prenom},\n\nLe tirage de la tontine "${tontine.nom}" dont vous etiez beneficiaire a ete annule.\n\nRaison : ${raison}\n\nUn nouveau tirage sera effectue prochainement.`
        );
      } catch (emailError) {
        logger.error('Erreur envoi email annulation:', emailError);
      }
    }

    return ApiResponse.success(res, tirage, 'Tirage annule');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Liste des tirages d'une tontine
 * @route   GET /digitontine/tirages/tontine/:tontineId
 * @access  Private
 */
const listeTiragesTontine = async (req, res, next) => {
  try {
    const { tontineId } = req.params;
    const { statut } = req.query;

    const query = { tontineId };
    if (statut) query.statut = statut;

    const tirages = await Tirage.find(query)
      .populate('beneficiaire', 'prenom nom email numeroTelephone')
      .populate('effectuePar', 'prenom nom')
      .sort({ dateEffective: -1 });

    return ApiResponse.success(res, tirages, `${tirages.length} tirage(s) trouve(s)`);
  } catch (error) {
    next(error);
  }
};
/**
 * @desc    Mes gains (tirages gagnes par l'utilisateur)
 * @route   GET /digitontine/tirages/me/gains
 * @access  Private (Membre)
 */
const mesGains = async (req, res) => {
  try {
    // Verifier que req.user existe
    if (!req.user || !req.user._id) {
      logger.error('Erreur mesGains: req.user non defini');
      return ApiResponse.error(res, 'Utilisateur non authentifie', 401);
    }

    const userId = req.user._id;
    logger.info(`Recherche gains pour userId: ${userId}`);

    // ✅ CORRECTION: beneficiaire au lieu de beneficiaireId
    let tirages = await Tirage.find({
      beneficiaire: userId  // ✅ PAS beneficiaireId
    })
      .populate('tontineId', 'nom montantCotisation frequence')
      .sort({ dateEffective: -1 })
      .lean();

    // S'assurer que tirages est un tableau
    if (!tirages) {
      logger.warn(`Aucun gain trouve pour userId: ${userId}`);
      tirages = [];
    }

    // Calculer le total des gains
    const totalGains = tirages.reduce((sum, tirage) => {
      return sum + (tirage.montant || 0);  // ✅ montant au lieu de montantDistribue
    }, 0);

    logger.info(`${tirages.length} gain(s) trouve(s) pour ${req.user.email} - Total: ${totalGains} FCFA`);

    return ApiResponse.success(res, {
      tirages: tirages.map(t => ({
        _id: t._id,
        tontine: {
          id: t.tontineId?._id,
          nom: t.tontineId?.nom || 'Tontine inconnue'
        },
        numeroTirage: t.numeroTirage,
        montant: t.montant,  // ✅ montant au lieu de montantDistribue
        dateEffective: t.dateEffective,
        dateTirage: t.dateEffective,
        statutPaiement: t.statut
      })),
      total: tirages.length,
      totalMontant: totalGains
    }, `${tirages.length} gain(s) trouve(s)`);

  } catch (error) {
    logger.error('Erreur mesGains:', error);
    logger.error('Stack:', error.stack);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Détails d'un tirage
 * @route   GET /digitontine/tirages/:tirageId
 * @access  Private
 */
const detailsTirage = async (req, res, next) => {
  try {
    const { tirageId } = req.params;

    const tirage = await Tirage.findById(tirageId)
      .populate('beneficiaire', 'prenom nom email numeroTelephone')
      .populate('tontineId', 'nom montantCotisation frequence')
      .populate('effectuePar', 'prenom nom')
      .populate('annulePar', 'prenom nom');

    if (!tirage) {
      throw new AppError('Tirage introuvable', 404);
    }

    const estAdmin = req.user.role === 'Administrateur';
    const estTresorier = req.user.role === 'Tresorier';
    const estBeneficiaire = tirage.beneficiaire._id.equals(req.user.id);

    const tontine = await Tontine.findById(tirage.tontineId);
    const estMembreTontine = tontine.membres.some(
      m => m.userId.toString() === req.user.id.toString()
    );

    if (!estAdmin && !estTresorier && !estBeneficiaire && !estMembreTontine) {
      throw new AppError('Acces refuse', 403);
    }

    return ApiResponse.success(res, tirage, 'Details du tirage');
  } catch (error) {
    next(error);
  }
};
/**
 * @desc    Effectuer un tirage automatique MODE TEST (sans validations)
 * @route   POST /digitontine/tirages/tontine/:tontineId/automatique-test
 * @access  Admin/Tresorier
 */
const effectuerTirageAutomatiqueTest = async (req, res, next) => {
  try {
    const { tontineId } = req.params;

    const tontine = await Tontine.findById(tontineId)
      .populate('membres.userId', 'prenom nom email numeroTelephone');

    if (!tontine) {
      throw new AppError('Tontine introuvable', 404);
    }

    if (tontine.statut !== 'Active') {
      throw new AppError('La tontine doit etre active', 400);
    }

    // Recuperer les tirages existants
    const tiragesExistants = await Tirage.find({ 
      tontineId, 
      statutPaiement: { $in: ['en_attente', 'paye'] }  // Tous les tirages valides
    }).distinct('beneficiaireId');

    // MODE TEST : Tous les membres n'ayant pas gagne sont eligibles
    const membresEligibles = tontine.membres.filter(
      m => !tiragesExistants.some(t => t.equals(m.userId._id))
    );

    if (membresEligibles.length === 0) {
      throw new AppError('Tous les membres ont deja gagne', 400);
    }

    logger.warn(`MODE TEST active - Tirage sans verifications`);

    // Calculer le prochain numero de tirage
    const numeroTirage = await Tirage.getProchainNumero(tontineId);

    // Selectionner au hasard
    const beneficiaire = membresEligibles[
      Math.floor(Math.random() * membresEligibles.length)
    ];

    const montantTotal = tontine.montantCotisation * tontine.membres.length;

    // Creer tirage avec les bons champs
    const nouveauTirage = await Tirage.create({
      tontineId,
      beneficiaireId: beneficiaire.userId._id,  // Correct
      numeroTirage,  // AJOUTE
      montantDistribue: montantTotal,  // CORRIGE (pas "montant")
      dateTirage: new Date(),
      methodeTirage: 'aleatoire',
      statutPaiement: 'en_attente',
      createdBy: req.user._id  // CORRIGE (pas "effectuePar")
    });

    await nouveauTirage.populate('beneficiaireId', 'prenom nom email numeroTelephone');

    // Logger
    await AuditLog.create({
      user: req.user._id,
      action: 'TIRAGE_TEST',
      details: {
        tirageId: nouveauTirage._id,
        tontineId,
        beneficiaire: beneficiaire.userId._id,
        montant: montantTotal,
        mode: 'TEST',
        numeroTirage
      },
      ipAddress: req.ip
    });

    // Notifications
    try {
      await emailService.sendTirageWinnerNotification(
        beneficiaire.userId,
        nouveauTirage,
        tontine
      );
    } catch (emailError) {
      logger.error('Erreur email gagnant:', emailError);
    }

    logger.info(
      `Tirage TEST effectue - Tontine: ${tontine.nom}, ` +
      `Gagnant: ${beneficiaire.userId.email}`
    );

    return ApiResponse.success(res, {
      tirage: {
        id: nouveauTirage._id,
        numeroTirage: nouveauTirage.numeroTirage,
        beneficiaire: {
          id: beneficiaire.userId._id,
          nom: beneficiaire.userId.nomComplet,
          email: beneficiaire.userId.email
        },
        montant: nouveauTirage.montantDistribue,
        dateTirage: nouveauTirage.dateTirage,
        methodeTirage: nouveauTirage.methodeTirage,
        statutPaiement: nouveauTirage.statutPaiement
      },
      tontine: {
        id: tontine._id,
        nom: tontine.nom
      },
      details: {
        mode: 'TEST',
        numeroTirage,
        membresEligibles: membresEligibles.length,
        avertissement: 'Tirage effectue sans verification des cotisations ni opt-in'
      }
    }, 'Tirage TEST effectue avec succes', 201);
  } catch (error) {
    next(error);
  }
};
module.exports = {
  effectuerTirageAutomatique,
  effectuerTirageManuel,
  effectuerTirageAutomatiqueTest,  // ✅ NOUVEAU
  annulerTirage,
  listeTiragesTontine,
  mesGains,
  detailsTirage,
  notifyUpcomingTirage,
};