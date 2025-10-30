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
const notificationService = require('../services/notification.service');

/**
 * Normaliser le rôle pour AuditLog
 */
const normalizeRoleForAudit = (role) => {
  const roleMap = {
    'Administrateur': 'admin',
    'Tresorier': 'tresorier',
    'Membre': 'membre'
  };
  return roleMap[role] || 'membre';
};

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
      statutPaiement: { $in: ['en_attente', 'paye'] }
    }).distinct('beneficiaireId');

    // Appliquer opt-in automatique
    const maintenant = Date.now();
    const delaiMs = tontine.delaiOptIn * 60 * 1000;

    for (const membre of tontine.membres) {
      const aDejaGagne = tiragesExistants.some(t => t.equals(membre.userId._id));
      
      if (!aDejaGagne && membre.dateNotificationTirage) {
        const tempsEcoule = maintenant - membre.dateNotificationTirage.getTime();
        
        if (tempsEcoule >= delaiMs && !membre.participeTirage) {
          membre.participeTirage = true;
          membre.optInAutomatique = true;
          membre.dateOptIn = Date.now();
          
          logger.info(
            ` Opt-in automatique pour ${membre.userId.email} ` +
            `(délai ${tontine.delaiOptIn} min dépassé)`
          );
        }
      }
    }

    await tontine.save();

    // Filtrer les membres éligibles
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

    // Vérifier les cotisations validées
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

    // Sélectionner un bénéficiaire au hasard
    const beneficiaire = membresEligibles[
      Math.floor(Math.random() * membresEligibles.length)
    ];

    const montantTotal = tontine.montantCotisation * tontine.membres.length;

    // Obtenir le prochain numéro de tirage
    const numeroTirage = await Tirage.getProchainNumero(tontineId);

    //  CRÉER LE TIRAGE AVEC LES BONS CHAMPS
    const nouveauTirage = await Tirage.create({
      tontineId,
      beneficiaireId: beneficiaire.userId._id,
      numeroTirage,
      montantDistribue: montantTotal,        //  CORRIGÉ
      dateTirage: new Date(),                //  CORRIGÉ
      methodeTirage: 'aleatoire',            //  CORRIGÉ
      statutPaiement: 'en_attente',          //  CORRIGÉ
      createdBy: req.user.id                 //  CORRIGÉ
    });

    await nouveauTirage.populate('beneficiaireId', 'prenom nom email numeroTelephone');

    // Créer un log d'audit
    await AuditLog.create({
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: normalizeRoleForAudit(req.user.role),
      action: 'CREATE_TIRAGE',
      resource: 'Tirage',
      resourceId: nouveauTirage._id,
      details: {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        tirageId: nouveauTirage._id,
        tontineId,
        beneficiaire: beneficiaire.userId._id,
        montant: montantTotal,
        type: 'Automatique',
        echeanceNumero: echeanceActuelle,
        membresEligibles: membresEligibles.length
      },
      statusCode: 201,
      success: true
    });

    // Envoyer notification au gagnant
    try {
      await notificationService.sendTirageWinnerNotification(
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
        await notificationService.sendTirageResultNotification(
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
      ` Tirage automatique effectue - Tontine: ${tontine.nom}, ` +
      `Gagnant: ${beneficiaire.userId.email}, Montant: ${montantTotal} FCFA`
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
      .populate('membres.userId', 'prenom nom email')
      .populate('createdBy', 'prenom nom email role')
      .populate('tresorierAssigne', 'prenom nom email role');

    if (!tontine) {
      throw new AppError('Tontine introuvable', 404);
    }

    if (tontine.statut !== 'Active') {
      throw new AppError('La tontine doit etre active', 400);
    }

    const tiragesExistants = await Tirage.find({ 
      tontineId, 
      statutPaiement: { $in: ['en_attente', 'paye'] }
    }).distinct('beneficiaireId');

    let notificationsSent = 0;
    const usersNotified = new Set(); // Pour éviter les doublons

    // ========================================
    // 1. NOTIFIER LES MEMBRES DE LA TONTINE
    // ========================================
    for (const membre of tontine.membres) {
      const aDejaGagne = tiragesExistants.some(t => t.equals(membre.userId._id));
      
      if (!aDejaGagne && !usersNotified.has(membre.userId._id.toString())) {
        // Enregistrer la date de notification
        membre.dateNotificationTirage = Date.now();
        membre.participeTirage = false;
        membre.optInAutomatique = false;
        
        try {
          await notificationService.sendTirageNotification(
            membre.userId, 
            tontine, 
            new Date(dateTirage),
            tontine.delaiOptIn
          );
          notificationsSent++;
          usersNotified.add(membre.userId._id.toString());
          logger.info(` Notification envoyée au MEMBRE: ${membre.userId.email}`);
        } catch (error) {
          logger.error(` Erreur notification pour ${membre.userId.email}:`, error);
        }
      }
    }

    // ========================================
    // 2. NOTIFIER L'ADMIN QUI LANCE LE TIRAGE (si pas déjà notifié)
    // ========================================
    const adminLanceur = req.user;
    if (!usersNotified.has(adminLanceur._id.toString())) {
      const adminADejaGagne = tiragesExistants.some(t => t.equals(adminLanceur._id));
      
      if (!adminADejaGagne) {
        // Vérifier si admin est déjà membre
        const adminEstMembre = tontine.membres.some(
          m => m.userId._id.equals(adminLanceur._id)
        );

        if (!adminEstMembre) {
          // Ajouter admin comme participant
          tontine.membres.push({
            userId: adminLanceur._id,
            dateAjout: Date.now(),
            role: 'Administrateur',
            statut: 'Actif',
            dateNotificationTirage: Date.now(),
            participeTirage: false,
            optInAutomatique: false
          });
        } else {
          // Mettre à jour si déjà membre
          const membreAdmin = tontine.membres.find(m => m.userId._id.equals(adminLanceur._id));
          membreAdmin.dateNotificationTirage = Date.now();
          membreAdmin.participeTirage = false;
          membreAdmin.optInAutomatique = false;
        }

        try {
          await notificationService.sendTirageNotification(
            adminLanceur, 
            tontine, 
            new Date(dateTirage),
            tontine.delaiOptIn
          );
          notificationsSent++;
          usersNotified.add(adminLanceur._id.toString());
          logger.info(`Notification envoyée à l'ADMIN lanceur: ${adminLanceur.email}`);
        } catch (error) {
          logger.error(` Erreur notification admin:`, error);
        }
      }
    }

    // ========================================
    // 3. NOTIFIER LE CRÉATEUR (si différent de l'admin lanceur)
    // ========================================
    if (tontine.createdBy && !usersNotified.has(tontine.createdBy._id.toString())) {
      const createurADejaGagne = tiragesExistants.some(t => t.equals(tontine.createdBy._id));

      if (!createurADejaGagne) {
        const createurEstMembre = tontine.membres.some(
          m => m.userId._id.equals(tontine.createdBy._id)
        );

        if (!createurEstMembre) {
          tontine.membres.push({
            userId: tontine.createdBy._id,
            dateAjout: Date.now(),
            role: tontine.createdBy.role || 'Tresorier',
            statut: 'Actif',
            dateNotificationTirage: Date.now(),
            participeTirage: false,
            optInAutomatique: false
          });
        } else {
          const membreCreateur = tontine.membres.find(m => m.userId._id.equals(tontine.createdBy._id));
          membreCreateur.dateNotificationTirage = Date.now();
          membreCreateur.participeTirage = false;
          membreCreateur.optInAutomatique = false;
        }

        try {
          await notificationService.sendTirageNotification(
            tontine.createdBy, 
            tontine, 
            new Date(dateTirage),
            tontine.delaiOptIn
          );
          notificationsSent++;
          usersNotified.add(tontine.createdBy._id.toString());
          logger.info(` Notification envoyée au CRÉATEUR: ${tontine.createdBy.email}`);
        } catch (error) {
          logger.error(` Erreur notification créateur:`, error);
        }
      }
    }

    // ========================================
    // 4. NOTIFIER LE TRÉSORIER ASSIGNÉ (si différent des précédents)
    // ========================================
    if (tontine.tresorierAssigne && !usersNotified.has(tontine.tresorierAssigne._id.toString())) {
      const tresorierADejaGagne = tiragesExistants.some(t => t.equals(tontine.tresorierAssigne._id));

      if (!tresorierADejaGagne) {
        const tresorierEstMembre = tontine.membres.some(
          m => m.userId._id.equals(tontine.tresorierAssigne._id)
        );

        if (!tresorierEstMembre) {
          tontine.membres.push({
            userId: tontine.tresorierAssigne._id,
            dateAjout: Date.now(),
            role: 'Tresorier',
            statut: 'Actif',
            dateNotificationTirage: Date.now(),
            participeTirage: false,
            optInAutomatique: false
          });
        } else {
          const membreTresorier = tontine.membres.find(m => m.userId._id.equals(tontine.tresorierAssigne._id));
          membreTresorier.dateNotificationTirage = Date.now();
          membreTresorier.participeTirage = false;
          membreTresorier.optInAutomatique = false;
        }

        try {
          await notificationService.sendTirageNotification(
            tontine.tresorierAssigne, 
            tontine, 
            new Date(dateTirage),
            tontine.delaiOptIn
          );
          notificationsSent++;
          usersNotified.add(tontine.tresorierAssigne._id.toString());
          logger.info(` Notification envoyée au TRÉSORIER: ${tontine.tresorierAssigne.email}`);
        } catch (error) {
          logger.error(` Erreur notification trésorier:`, error);
        }
      }
    }

    // Sauvegarder une seule fois
    await tontine.save();

    logger.info(
      ` Notifications tirage envoyées pour ${tontine.nom}: ${notificationsSent} personne(s) notifiée(s)`
    );

    return ApiResponse.success(res, {
      message: `Notifications envoyées. Délai opt-in : ${tontine.delaiOptIn} minutes`,
      notificationsSent,
      delaiOptIn: tontine.delaiOptIn,
      dateExpiration: new Date(Date.now() + tontine.delaiOptIn * 60 * 1000),
      usersNotified: Array.from(usersNotified).length
    });
  } catch (error) {
    logger.error(' Erreur notification tirage:', error);
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
      beneficiaireId: beneficiaireId,
      statutPaiement: { $in: ['en_attente', 'paye'] }
    });

    if (aDejaGagne) {
      throw new AppError('Ce membre a deja gagne', 400);
    }

    const montantTotal = tontine.montantCotisation * tontine.membres.length;

    // Obtenir le prochain numéro de tirage
    const numeroTirage = await Tirage.getProchainNumero(tontineId);

    //  CRÉER LE TIRAGE AVEC LES BONS CHAMPS
    const nouveauTirage = await Tirage.create({
      tontineId,
      beneficiaireId: beneficiaireId,
      numeroTirage,
      montantDistribue: montantTotal,        //  CORRIGÉ
      dateTirage: new Date(),                //  CORRIGÉ
      methodeTirage: 'manuel',               //  CORRIGÉ
      statutPaiement: 'en_attente',          //  CORRIGÉ
      createdBy: req.user.id,                //  CORRIGÉ
      notes: raison || 'Tirage manuel administrateur'  //  Utiliser "notes"
    });

    await nouveauTirage.populate('beneficiaireId', 'prenom nom email numeroTelephone');

    await AuditLog.create({
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: normalizeRoleForAudit(req.user.role),
      action: 'CREATE_TIRAGE',
      resource: 'Tirage',
      resourceId: nouveauTirage._id,
      details: {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        tirageId: nouveauTirage._id,
        tontineId,
        beneficiaire: beneficiaireId,
        montant: montantTotal,
        raison
      },
      statusCode: 201,
      success: true
    });

    const beneficiaire = await User.findById(beneficiaireId);
    
    try {
      await notificationService.sendTirageWinnerNotification(
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

    if (tirage.statutPaiement === 'echec') {
      throw new AppError('Tirage deja annule', 400);
    }

    // UTILISER LES BONS CHAMPS
    tirage.statutPaiement = 'echec';
    tirage.notes = `ANNULÉ - Raison: ${raison} - Par: ${req.user.email} - Date: ${new Date().toISOString()}`;
    
    await tirage.save();

    await AuditLog.create({
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: normalizeRoleForAudit(req.user.role),
      action: 'CREATE_TIRAGE',
      resource: 'Tirage',
      resourceId: tirageId,
      details: {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        tirageId,
        tontineId: tirage.tontineId,
        beneficiaire: tirage.beneficiaireId,
        raison
      },
      statusCode: 200,
      success: true,
      tags: ['annulation']
    });

    const beneficiaire = await User.findById(tirage.beneficiaireId);
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
    if (statut) query.statutPaiement = statut;  

    //  POPULATE AVEC LES BONS CHAMPS
    const tirages = await Tirage.find(query)
      .populate('beneficiaireId', 'prenom nom email numeroTelephone')
      .populate('createdBy', 'prenom nom')
      .sort({ dateTirage: -1 });

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
    // Vérifier que req.user existe
    if (!req.user || !req.user._id) {
      logger.error('Erreur mesGains: req.user non défini');
      return ApiResponse.error(res, 'Utilisateur non authentifié', 401);
    }

    const userId = req.user._id;
    logger.info(`Recherche gains pour userId: ${userId}`);

    //  CORRECTION: Utiliser beneficiaireId et dateTirage
    let tirages = await Tirage.find({
      beneficiaireId: userId  //  CORRIGÉ
    })
      .populate('tontineId', 'nom montantCotisation frequence')
      .sort({ dateTirage: -1 })  //  CORRIGÉ
      .lean();

    // S'assurer que tirages est un tableau
    if (!tirages) {
      logger.warn(`Aucun gain trouvé pour userId: ${userId}`);
      tirages = [];
    }

    //  CORRECTION: Utiliser montantDistribue
    const totalGains = tirages.reduce((sum, tirage) => {
      return sum + (tirage.montantDistribue || 0);  //  CORRIGÉ
    }, 0);

    logger.info(`${tirages.length} gain(s) trouvé(s) pour ${req.user.email} - Total: ${totalGains} FCFA`);

    //  CORRECTION: Mapper les bons champs
    return ApiResponse.success(res, {
      tirages: tirages.map(t => ({
        _id: t._id,
        tontine: {
          id: t.tontineId?._id,
          nom: t.tontineId?.nom || 'Tontine inconnue'
        },
        numeroTirage: t.numeroTirage,
        montant: t.montantDistribue,  //  CORRIGÉ
        dateTirage: t.dateTirage,     //  CORRIGÉ
        statutPaiement: t.statutPaiement  //  CORRIGÉ
      })),
      total: tirages.length,
      totalMontant: totalGains
    }, `${tirages.length} gain(s) trouvé(s)`);

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
      .populate('beneficiaireId', 'prenom nom email numeroTelephone')
      .populate('tontineId', 'nom montantCotisation frequence')
      .populate('createdBy', 'prenom nom')
      .populate('validePar', 'prenom nom');

    if (!tirage) {
      throw new AppError('Tirage introuvable', 404);
    }

    const estAdmin = req.user.role === 'admin';
    const estTresorier = req.user.role === 'tresorier';
    
    //  CORRECTION: Utiliser beneficiaireId au lieu de beneficiaire
    const estBeneficiaire = tirage.beneficiaireId._id.equals(req.user._id);  //  CORRIGÉ

    const tontine = await Tontine.findById(tirage.tontineId);
    const estMembreTontine = tontine.membres.some(
      m => m.userId.toString() === req.user._id.toString()
    );

    if (!estAdmin && !estTresorier && !estBeneficiaire && !estMembreTontine) {
      throw new AppError('Accès refusé', 403);
    }

    return ApiResponse.success(res, tirage, 'Détails du tirage');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Effectuer un tirage automatique MODE TEST (AVEC notification + opt-in intelligent)
 * @route   POST /digitontine/tirages/tontine/:tontineId/automatique-test
 * @access  Admin/Tresorier
 */
const effectuerTirageAutomatiqueTest = async (req, res, next) => {
  try {
    const { tontineId } = req.params;

    const tontine = await Tontine.findById(tontineId)
      .populate('membres.userId', 'prenom nom email numeroTelephone')
      .populate('createdBy', 'prenom nom email numeroTelephone role');

    if (!tontine) {
      throw new AppError('Tontine introuvable', 404);
    }

    if (tontine.statut !== 'Active') {
      throw new AppError('La tontine doit etre active', 400);
    }

    logger.warn(`[TIRAGE TEST] Debut - Tontine: ${tontine.nom}`);

    // ========================================
    // ETAPE 1 : RECUPERER LES GAGNANTS EXISTANTS
    // ========================================
    const tiragesExistants = await Tirage.find({ 
      tontineId, 
      statutPaiement: { $in: ['en_attente', 'paye'] }
    }).distinct('beneficiaireId');

    logger.info(`[TIRAGE TEST] Tirages existants: ${tiragesExistants.length}`);

    // ========================================
    // ETAPE 2 : REINITIALISER LES CONFIRMATIONS
    // ========================================
    logger.warn(`[TIRAGE TEST] ETAPE 1: Reinitialisation des confirmations...`);
    
    for (const membre of tontine.membres) {
      const aDejaGagne = tiragesExistants.some(t => t.equals(membre.userId._id));
      if (!aDejaGagne) {
        membre.participeTirage = false;  // RESET
        membre.dateNotificationTirage = Date.now();
        membre.optInAutomatique = false;
      }
    }
    
    await tontine.save();

    // ========================================
    // ETAPE 3 : ENVOYER NOTIFICATIONS
    // ========================================
    logger.warn(`[TIRAGE TEST] ETAPE 2: Envoi des notifications...`);

    const dateTirageProchaine = new Date(Date.now() + tontine.delaiOptIn * 60 * 1000);
    let notificationsSent = 0;
    const membresANotifier = [];
    const membresIdANotifier = new Set();

    for (const membre of tontine.membres) {
      const aDejaGagne = tiragesExistants.some(t => t.equals(membre.userId._id));
      
      if (!aDejaGagne) {
        membresANotifier.push(membre);
        membresIdANotifier.add(membre.userId._id.toString());
        
        try {
          await notificationService.sendTirageNotification(
            membre.userId,
            tontine,
            dateTirageProchaine,
            tontine.delaiOptIn
          );
          notificationsSent++;
          logger.info(`[TIRAGE TEST] Email envoye: ${membre.userId.email}`);
        } catch (error) {
          logger.error(`[TIRAGE TEST] Erreur email ${membre.userId.email}:`, error.message);
        }
      }
    }

    logger.warn(`[TIRAGE TEST] ${notificationsSent}/${membresANotifier.length} notifications envoyees`);

    // ========================================
    // ETAPE 4 : BOUCLE D'ATTENTE INTELLIGENTE
    // ========================================
    logger.warn(`[TIRAGE TEST] ETAPE 3: Attente intelligente (delai max: ${tontine.delaiOptIn} min)...`);

    const timeoutMs = tontine.delaiOptIn * 60 * 1000;
    const pollIntervalMs = 3000; // Verifier toutes les 3 secondes (plus rapide)
    const startTime = Date.now();
    let tousOntConfirme = false;

    while (Date.now() - startTime < timeoutMs) {
      // ✅ Recharger la tontine AVEC populate
      const tontineActuelle = await Tontine.findById(tontineId)
        .populate('membres.userId', 'prenom nom email numeroTelephone');

      if (!tontineActuelle) {
        throw new AppError('Tontine supprimée pendant le tirage', 404);
      }

      // Compter les confirmations et refus
      let confirmations = 0;
      let refus = 0;
      let enAttente = 0;

      for (const membreIdStr of membresIdANotifier) {
        const membreActuel = tontineActuelle.membres.find(m => 
          m.userId._id.toString() === membreIdStr
        );
        
        if (membreActuel) {
          if (membreActuel.participeTirage === true) {
            confirmations++;
            logger.debug(`[TIRAGE TEST] ✅ CONFIRMÉ: ${membreActuel.userId.email}`);
          } else if (membreActuel.participeTirage === false && membreActuel.dateOptIn) {
            // dateOptIn existe = a explicitement cliqué "refuser"
            refus++;
            logger.debug(`[TIRAGE TEST] ❌ REFUSÉ: ${membreActuel.userId.email}`);
          } else {
            enAttente++;
            logger.debug(`[TIRAGE TEST] ⏳ EN ATTENTE: ${membreActuel.userId.email}`);
          }
        }
      }

      logger.info(
        `[TIRAGE TEST] Status: ${confirmations} confirmés, ${refus} refusés, ${enAttente} en attente`
      );

      // Scenario 1: TOUS ONT CONFIRMÉ → Tirage immédiat
      if (confirmations === membresIdANotifier.size) {
        tousOntConfirme = true;
        const tempsEcoule = Date.now() - startTime;
        const minutesEcoulees = Math.round(tempsEcoule / 60000 * 10) / 10;
        logger.warn(`[TIRAGE TEST] ✅ TOUS LES CONFIRMÉS après ${minutesEcoulees} min`);
        break;
      }

      // Scenario 2: ON NE PEUT PLUS AVOIR 100% → Délai écoulé
      // (Si confirmés + refusés = total, on sait qu'on ne peut plus avoir 100%)
      if (confirmations + refus === membresIdANotifier.size && confirmations < membresIdANotifier.size) {
        logger.warn(
          `[TIRAGE TEST] ⚠️ CONFIRMATIONS INCOMPLÈTES (${confirmations}/${membresIdANotifier.size})`
        );
        logger.warn(`[TIRAGE TEST] Certains ont refusé. Attente délai complet...`);
        // Continue jusqu'au délai complet
      }

      // Verifier si delai ecoule
      if (Date.now() - startTime >= timeoutMs) {
        logger.warn(`[TIRAGE TEST] ⏰ DÉLAI D'OPT-IN ÉCOULÉ (${tontine.delaiOptIn} min)`);
        break;
      }

      // Attendre avant la prochaine verification
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    // ========================================
    // ETAPE 5 : VÉRIFIER QU'ON A ASSEZ DE PARTICIPANTS
    // ========================================
    logger.warn(`[TIRAGE TEST] ETAPE 4: Vérification des confirmations finales...`);

    const tontineReload = await Tontine.findById(tontineId)
      .populate('membres.userId', 'prenom nom email numeroTelephone');
    
    let confirmationsFinales = 0;
    let refusFinaux = 0;

    for (const membreIdStr of membresIdANotifier) {
      const membreActuel = tontineReload.membres.find(m => 
        m.userId._id.toString() === membreIdStr
      );
      
      if (membreActuel) {
        if (membreActuel.participeTirage === true) {
          confirmationsFinales++;
        } else if (membreActuel.dateOptIn) {
          refusFinaux++;
        }
      }
    }

    logger.info(`[TIRAGE TEST] Confirmations finales: ${confirmationsFinales}/${membresIdANotifier.size}`);
    logger.info(`[TIRAGE TEST] Refus: ${refusFinaux}/${membresIdANotifier.size}`);

    // ========================================
    // ETAPE 6 : APPLIQUER OPT-IN AUTOMATIQUE
    // ========================================
    logger.warn(`[TIRAGE TEST] ETAPE 5: Opt-in automatique pour les non-répondants...`);

    let optInAutoCount = 0;

    for (const membreIdStr of membresIdANotifier) {
      const membreActuel = tontineReload.membres.find(m => 
        m.userId._id.toString() === membreIdStr
      );
      
      // Si pas de dateOptIn = n'a PAS cliqué (ni oui ni non)
      // → Opt-in automatique
      if (membreActuel && !membreActuel.dateOptIn) {
        membreActuel.participeTirage = true;
        membreActuel.optInAutomatique = true;
        membreActuel.dateOptIn = Date.now();
        optInAutoCount++;
        
        logger.info(`[TIRAGE TEST] Opt-in AUTO: ${membreActuel.userId.email}`);
      } else if (membreActuel && membreActuel.participeTirage === false) {
        // A explicitement refusé → ne pas changer
        logger.info(`[TIRAGE TEST] SKIP (refusé): ${membreActuel.userId.email}`);
      }
    }

    await tontineReload.save();
    logger.warn(`[TIRAGE TEST] ${optInAutoCount} opt-in automatiques appliques`);

    // ========================================
    // ETAPE 7 : FILTRER LES ÉLIGIBLES
    // ========================================
    logger.warn(`[TIRAGE TEST] ETAPE 6: Filtrage des eligibles...`);

    const membresEligibles = tontineReload.membres.filter(m => 
      m.participeTirage === true && 
      !tiragesExistants.some(t => t.equals(m.userId._id))
    );

    logger.info(`[TIRAGE TEST] Membres eligibles: ${membresEligibles.length}`);

    if (membresEligibles.length === 0) {
      logger.error(`[TIRAGE TEST] ❌ IMPOSSIBLE: Aucun participant!`);
      logger.error(`[TIRAGE TEST] Confirmations: ${confirmationsFinales}, Refus: ${refusFinaux}`);
      throw new AppError(
        `Tirage annulé: Pas assez de participants. ` +
        `${confirmationsFinales} confirmés, ${refusFinaux} ont refusé. ` +
        `Minimum 1 requis.`,
        400
      );
    }

    // ========================================
// ETAPE 8 : EFFECTUER LE TIRAGE
// ========================================
logger.warn(`[TIRAGE TEST] ETAPE 7: Tirage aleatoire...`);

const indexGagnant = Math.floor(Math.random() * membresEligibles.length);
const membreGagnant = membresEligibles[indexGagnant];
const beneficiaire = membreGagnant;

//  CALCUL CORRECT DU MONTANT
const echeanceActuelle = tiragesExistants.length + 1;

const cotisationsValidees = await Transaction.aggregate([
  {
    $match: {
      tontineId: tontineReload._id,
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
const montantTotal = tontineReload.montantCotisation * nombreMembresAyantCotise;

logger.info(
  `[TIRAGE TEST] Montant: ${nombreMembresAyantCotise} cotisations × ` +
  `${tontineReload.montantCotisation} FCFA = ${montantTotal} FCFA`
);

//  Vérification optionnelle
if (nombreMembresAyantCotise === 0) {
  throw new AppError('Aucune cotisation validée pour cette échéance', 400);
}

const numeroTirage = await Tirage.getProchainNumero(tontineId);

const nouveauTirage = await Tirage.create({
  tontineId,
  beneficiaireId: beneficiaire.userId._id,
  numeroTirage,
  montantDistribue: montantTotal,  //  Montant correct
  dateTirage: new Date(),
  methodeTirage: 'aleatoire',
  statutPaiement: 'en_attente',
  createdBy: req.user.id
});

await nouveauTirage.populate('beneficiaireId', 'prenom nom email numeroTelephone');

logger.warn(`[TIRAGE TEST]  GAGNANT: ${beneficiaire.userId.email} - ${montantTotal} FCFA`);
    // ========================================
    // ETAPE 9 : LOG D'AUDIT
    // ========================================
    try {
      await AuditLog.create({
        userId: req.user._id,
        userEmail: req.user.email,
        userRole: normalizeRoleForAudit(req.user.role),
        action: 'CREATE_TIRAGE',
        resource: 'Tirage',
        resourceId: nouveauTirage._id,
        details: {
          method: req.method,
          url: req.originalUrl,
          ip: req.ip,
          userAgent: req.get('user-agent'),
          tontineId,
          beneficiaire: beneficiaire.userId._id,
          montant: montantTotal,
          numeroTirage,
          mode: 'TEST COMPLET INTELLIGENT',
          confirmations: confirmationsFinales,
          refus: refusFinaux,
          optInAuto: optInAutoCount
        },
        statusCode: 201,
        success: true,
        severity: 'warning',
        tags: ['tirage', 'test', 'automatique', 'intelligent']
      });
    } catch (auditError) {
      logger.error('[TIRAGE TEST] Erreur AuditLog:', auditError.message);
    }

    // ========================================
    // ETAPE 10 : ENVOYER LES RÉSULTATS
    // ========================================
    logger.warn(`[TIRAGE TEST] ETAPE 8: Envoi des resultats...`);

    try {
      await notificationService.sendTirageWinnerNotification(
        beneficiaire.userId,
        nouveauTirage,
        tontineReload
      );
      logger.info(`[TIRAGE TEST] Email gagnant envoye`);
    } catch (error) {
      logger.error('[TIRAGE TEST] Erreur email gagnant:', error.message);
    }

    const autresMembres = tontineReload.membres.filter(
      m => !m.userId._id.equals(beneficiaire.userId._id)
    );
    
    for (const membre of autresMembres) {
      try {
        await notificationService.sendTirageResultNotification(
          membre.userId,
          nouveauTirage,
          tontineReload,
          beneficiaire.userId
        );
      } catch (error) {
        logger.error(`[TIRAGE TEST] Erreur email ${membre.userId.email}:`, error.message);
      }
    }

    logger.warn(`[TIRAGE TEST] ✅ TERMINÉ - Tontine: ${tontineReload.nom}`);

    // ========================================
    // RÉPONSE FINALE
    // ========================================
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
        methodeTirage: nouveauTirage.methodeTirage
      },
      tontine: {
        id: tontineReload._id,
        nom: tontineReload.nom
      },
      details: {
        mode: 'TEST INTELLIGENT',
        participants_total: membresIdANotifier.size,
        notifications_envoyees: notificationsSent,
        delai_opt_in_minutes: tontine.delaiOptIn,
        confirmations_finales: confirmationsFinales,
        refus_finaux: refusFinaux,
        opt_in_automatiques: optInAutoCount,
        membres_eligibles: membresEligibles.length,
        tous_ont_confirme: tousOntConfirme,
        message: tousOntConfirme 
          ? 'Tous les participants ont confirme. Tirage commence immediatement.'
          : `Delai d'opt-in ecoule. ${optInAutoCount} participants confirmes automatiquement. ${refusFinaux} ont refuse.`
      }
    }, 'Tirage effectue avec succes', 201);

  } catch (error) {
    logger.error('[TIRAGE TEST] Erreur:', error.message);
    next(error);
  }
};

/**
 * @desc    Confirmer participation au tirage
 * @route   POST /digitontine/tirages/:tontineId/confirm-participation
 * @access  Private (Membre)
 */
const confirmParticipationTirage = async (req, res) => {
  try {
    const { tontineId } = req.params;
    const { participate } = req.body; // true = OUI, false = NON
    const user = req.user;

    if (typeof participate !== 'boolean') {
      return ApiResponse.error(res, 'participate doit être true ou false', 400);
    }

    const tontine = await Tontine.findById(tontineId);
    if (!tontine) {
      return ApiResponse.notFound(res, 'Tontine introuvable');
    }

    const membre = tontine.membres.find(
      m => m.userId.toString() === user._id.toString()
    );
    
    if (!membre) {
      return ApiResponse.forbidden(res, 'Vous n\'etes pas membre de cette tontine');
    }

    // Marquer la réponse
    membre.participeTirage = participate;
    membre.dateOptIn = Date.now(); // ← IMPORTANT: Marque qu'il a répondu
    
    await tontine.save();

    logger.info(
      `[TIRAGE] ${user.email} - ${participate ? '✅ CONFIRME' : '❌ REFUSÉ'} participation - ${tontine.nom}`
    );

    return ApiResponse.success(res, {
      participate,
      message: participate 
        ? 'Vous participez au tirage' 
        : 'Vous refusez de participer',
    });
  } catch (error) {
    logger.error('Erreur confirmation tirage:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Refuser participation au tirage
 * @route   POST /digitontine/tirages/:tontineId/opt-out
 * @access  Private (Membre de la tontine)
 */
const optOutForTirage = async (req, res) => {
  try {
    const { tontineId } = req.params;
    const user = req.user;

    const tontine = await Tontine.findById(tontineId);
    if (!tontine) {
      return ApiResponse.notFound(res, 'Tontine introuvable');
    }

    if (tontine.statut !== 'Active') {
      return ApiResponse.error(res, 'La tontine doit etre active', 400);
    }

    // Trouver le membre
    const membre = tontine.membres.find(
      m => m.userId.toString() === user._id.toString()
    );
    
    if (!membre) {
      return ApiResponse.forbidden(res, 'Vous n\'etes pas membre de cette tontine');
    }

    if (membre.aGagne) {
      return ApiResponse.error(res, 'Vous avez deja gagne le tirage de cette tontine', 400);
    }

    // Refuser la participation
    membre.participeTirage = false;
    membre.dateOptIn = Date.now();
    
    await tontine.save();

    logger.info(
      `Refus participation au tirage - ${user.email} - ${tontine.nom}`
    );

    return ApiResponse.success(res, {
      message: 'Vous ne participerez pas au tirage',
      participeTirage: false,
      dateOptIn: membre.dateOptIn,
    });
  } catch (error) {
    logger.error('Erreur opt-out tirage:', error);
    return ApiResponse.serverError(res);
  }
};
module.exports = {
  effectuerTirageAutomatique,
  effectuerTirageManuel,
  effectuerTirageAutomatiqueTest,
  confirmParticipationTirage,  //  NOUVEAU
  annulerTirage,
  listeTiragesTontine,
  mesGains,
  detailsTirage,
  notifyUpcomingTirage,
  optOutForTirage,
};