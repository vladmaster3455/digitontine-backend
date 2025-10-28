// controllers/tirage.controller.js
const Tirage = require('../models/Tirage');
const Tontine = require('../models/Tontine');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const emailService = require('../services/email.service');
const logger = require('../utils/logger');
const { ApiResponse } = require('../utils/apiResponse');
const { AppError } = require('../utils/errors');

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

    // Filtrer les membres éligibles (n'ont pas encore gagné ET participent au tirage)
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

    // CORRECTION: Vérifier les cotisations validées pour cette échéance
    // On compte les cotisations validées par membre unique pour cette échéance
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
          _id: '$userId', // Grouper par membre
          count: { $sum: 1 }
        }
      }
    ]);

    const nombreMembresAyantCotise = cotisationsValidees.length;

    // OPTION 1: Vérifier que tous les membres ont cotisé (strict)
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

    // OPTION 2: Accepter le tirage si au moins les membres éligibles ont cotisé (moins strict)
    // Décommentez cette section si vous préférez cette approche
    /*
    const membresEligiblesIds = membresEligibles.map(m => m.userId._id.toString());
    const membresEligiblesAyantCotise = cotisationsValidees.filter(
      c => membresEligiblesIds.includes(c._id.toString())
    ).length;

    if (membresEligiblesAyantCotise < membresEligibles.length) {
      throw new AppError(
        `${membresEligiblesAyantCotise}/${membresEligibles.length} membres eligibles ont cotisé. ` +
        `Tirage impossible.`,
        400
      );
    }
    */

    // Sélectionner un bénéficiaire au hasard parmi les membres éligibles
    const beneficiaire = membresEligibles[
      Math.floor(Math.random() * membresEligibles.length)
    ];

    const montantTotal = tontine.montantCotisation * tontine.membres.length;

   // controllers/tirage.controller.js
// REMPLACER la section de création du tirage (ligne 40-55 environ)

const nouveauTirage = await Tirage.create({
  tontineId,
  beneficiaireId: beneficiaire.userId._id,  // CORRECTION: était "beneficiaire"
  montant: montantTotal,
  dateEffective: new Date(),
  typeTirage: 'Automatique',
  statut: 'Effectue',
  effectuePar: req.user.id
});

await nouveauTirage.populate('beneficiaireId', 'prenom nom email numeroTelephone');  // CORRECTION: était "beneficiaire"

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
    let notificationsFailed = 0;

    for (const membre of tontine.membres) {
      const aDejaGagne = tiragesExistants.some(t => t.equals(membre.userId._id));
      
      if (!aDejaGagne) {
        try {
          await emailService.sendTirageNotification(
            membre.userId, 
            tontine, 
            new Date(dateTirage)
          );
          notificationsSent++;
        } catch (error) {
          logger.error(`Erreur notification pour ${membre.userId.email}:`, error);
          notificationsFailed++;
        }
      }
    }

    logger.info(
      `Notifications tirage envoyees pour ${tontine.nom}: ` +
      `${notificationsSent} reussies, ${notificationsFailed} echouees`
    );

    return ApiResponse.success(res, {
      message: 'Notifications envoyees',
      notificationsSent,
      notificationsFailed,
      dateTirage,
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
 * @desc    Mes gains (Membre)
 * @route   GET /digitontine/tirages/me/gains
 * @access  Private (Membre)
 */
const mesGains = async (req, res, next) => {
  try {
    const tirages = await Tirage.find({
      beneficiaire: req.user.id,
      statut: 'Effectue'
    })
      .populate('tontineId', 'nom montantCotisation frequence')
      .sort({ dateEffective: -1 });

    const totalGagne = tirages.reduce((sum, t) => sum + t.montant, 0);

    return ApiResponse.success(res, {
      tirages,
      totalGagne,
      nombreGains: tirages.length
    }, 'Historique des gains');
  } catch (error) {
    next(error);
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

// ✅ EXPORT CORRECT
module.exports = {
  effectuerTirageAutomatique,
  effectuerTirageManuel,
  annulerTirage,
  listeTiragesTontine,
  mesGains,
  detailsTirage,
  notifyUpcomingTirage,
};