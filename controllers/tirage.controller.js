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
 * @desc    Effectuer un tirage automatique MODE TEST (AVEC notification + opt-in)
 * @route   POST /digitontine/tirages/tontine/:tontineId/automatique-test
 * @access  Admin/Tresorier
 * 
 * FLUX COMPLET :
 * 1. Envoyer emails de notification aux membres
 * 2. Attendre delai opt-in (ex: 15 minutes)
 * 3. Appliquer opt-in automatique pour non-repondants
 * 4. Effectuer le tirage parmi ceux qui participent
 * 5. Envoyer resultats
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

    logger.warn(`MODE TEST: Debut tirage automatique - Tontine: ${tontine.nom}`);

    // ========================================
    // ETAPE 1 : RECUPERER LES GAGNANTS EXISTANTS
    // ========================================
    const tiragesExistants = await Tirage.find({ 
      tontineId, 
      statutPaiement: { $in: ['en_attente', 'paye'] }
    }).distinct('beneficiaireId');

    logger.info(`Tirages existants: ${tiragesExistants.length}`);

    // ========================================
    // ETAPE 2 : ENVOYER EMAILS DE NOTIFICATION
    // ========================================
    logger.warn(`ETAPE 1 (TEST): Envoi des notifications...`);
    
    const dateTirageProchaine = new Date(Date.now() + tontine.delaiOptIn * 60 * 1000);
    let notificationsSent = 0;

    for (const membre of tontine.membres) {
      const aDejaGagne = tiragesExistants.some(
        t => t.equals(membre.userId._id)
      );
      
      if (!aDejaGagne) {
        // Enregistrer la date de notification
        membre.dateNotificationTirage = Date.now();
        membre.participeTirage = false;  // Reset pour nouveau tirage
        membre.optInAutomatique = false; // Reset
        
        try {
          await emailService.sendTirageNotification(
            membre.userId, 
            tontine, 
            dateTirageProchaine,
            tontine.delaiOptIn
          );
          notificationsSent++;
          logger.info(`Email envoye a ${membre.userId.email}`);
        } catch (error) {
          logger.error(`Erreur notification pour ${membre.userId.email}:`, error);
        }
      }
    }

    // Sauvegarder apres les notifications
    await tontine.save();

    logger.warn(`Notifications envoyees: ${notificationsSent} membre(s)`);

    // ========================================
    // ETAPE 3 : ATTENDRE LE DELAI OPT-IN (TEST)
    // ========================================
    logger.warn(`ETAPE 2 (TEST): ATTENTE DE ${tontine.delaiOptIn} MINUTES...`);
    logger.warn(`Les membres ont jusqu'a ${new Date(dateTirageProchaine).toLocaleTimeString('fr-FR')} pour repondre`);
    
    const delaiMs = tontine.delaiOptIn * 60 * 1000;
    await new Promise(resolve => setTimeout(resolve, delaiMs));

    logger.warn(`Delai d'opt-in (TEST) termine`);

    // ========================================
    // ETAPE 4 : RECHARGER + APPLIQUER OPT-IN AUTOMATIQUE
    // ========================================
    logger.warn(`ETAPE 3 (TEST): Reactualisation et opt-in automatique...`);
    
    const tontineReload = await Tontine.findById(tontineId)
      .populate('membres.userId', 'prenom nom email numeroTelephone');

    if (!tontineReload) {
      throw new AppError('Tontine non trouvee apres delai', 404);
    }

    let optInAutoCount = 0;

    for (const membre of tontineReload.membres) {
      const aDejaGagne = tiragesExistants.some(
        t => t.equals(membre.userId._id)
      );
      
      // Appliquer opt-in automatique pour ceux qui n'ont pas repondu
      if (!aDejaGagne && !membre.participeTirage && membre.dateNotificationTirage) {
        membre.participeTirage = true;
        membre.optInAutomatique = true;
        membre.dateOptIn = Date.now();
        optInAutoCount++;
        
        logger.info(
          `Opt-in AUTO applique pour ${membre.userId.email}`
        );
      }
    }

    await tontineReload.save();
    logger.warn(`Opt-in automatiques appliques: ${optInAutoCount}`);

    // ========================================
    // ETAPE 5 : FILTRER LES MEMBRES ELIGIBLES
    // ========================================
    logger.warn(`ETAPE 4 (TEST): Filtrage des participants...`);
    
    const membresEligibles = tontineReload.membres.filter(
      m => !tiragesExistants.some(t => t.equals(m.userId._id)) 
        && m.participeTirage === true
    );

    logger.warn(`Membres eligibles: ${membresEligibles.length}`);

    if (membresEligibles.length === 0) {
      throw new AppError('Aucun membre n\'a confirme sa participation', 400);
    }

    // ========================================
    // ETAPE 6 : EFFECTUER LE TIRAGE (MODE TEST)
    // ========================================
    logger.warn(`ETAPE 5 (TEST): Tirage aleatoire...`);
    
    // Selectionner au hasard
    const beneficiaire = membresEligibles[
      Math.floor(Math.random() * membresEligibles.length)
    ];

    const montantTotal = tontineReload.montantCotisation * tontineReload.membres.length;

    // Calculer le prochain numero de tirage
    const numeroTirage = await Tirage.getProchainNumero(tontineId);

    // Creer le tirage avec les bons champs du modele
    const nouveauTirage = await Tirage.create({
      tontineId,
      beneficiaireId: beneficiaire.userId._id,
      numeroTirage,
      montantDistribue: montantTotal,
      dateTirage: new Date(),
      methodeTirage: 'aleatoire',
      statutPaiement: 'en_attente',
      createdBy: req.user._id
    });

    await nouveauTirage.populate('beneficiaireId', 'prenom nom email numeroTelephone');

    logger.warn(`GAGNANT (TEST): ${beneficiaire.userId.email} - Montant: ${montantTotal} FCFA`);

    // ========================================
    // ETAPE 7 : CREER LOG D'AUDIT
    // ========================================
    
    // Normaliser le role pour AuditLog (minuscules)
    const normalizeRoleForAudit = (role) => {
      const roleMap = {
        'Administrateur': 'admin',
        'Tresorier': 'tresorier',
        'Membre': 'membre'
      };
      return roleMap[role] || 'membre';
    };

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
          mode: 'TEST COMPLET',
          etapes: {
            notificationsEnvoyees: notificationsSent,
            delaiOptInMinutes: tontine.delaiOptIn,
            optInAutomatiques: optInAutoCount,
            membresEligibles: membresEligibles.length,
          },
          avertissement: 'Tirage TEST avec notification + opt-in complet'
        },
        statusCode: 201,
        success: true,
        severity: 'warning',
        tags: ['tirage', 'test', 'automatique', 'avec-notification']
      });
    } catch (auditError) {
      logger.error('Erreur creation AuditLog:', auditError);
    }

    // ========================================
    // ETAPE 8 : ENVOYER LES RESULTATS
    // ========================================
    logger.warn(`ETAPE 6 (TEST): Envoi des resultats...`);

    // Email au gagnant
    try {
      await emailService.sendTirageWinnerNotification(
        beneficiaire.userId,
        nouveauTirage,
        tontineReload
      );
      logger.info(`Email gagnant envoye a ${beneficiaire.userId.email}`);
    } catch (emailError) {
      logger.error('Erreur email gagnant:', emailError);
    }

    // Emails aux autres membres
    const autresMembres = tontineReload.membres.filter(
      m => !m.userId._id.equals(beneficiaire.userId._id)
    );
    
    for (const membre of autresMembres) {
      try {
        await emailService.sendTirageResultNotification(
          membre.userId,
          nouveauTirage,
          tontineReload,
          beneficiaire.userId
        );
      } catch (emailError) {
        logger.error(`Erreur email resultat ${membre.userId.email}:`, emailError);
      }
    }

    logger.warn(`TIRAGE TEST TERMINE - Tontine: ${tontineReload.nom}`);

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
        id: tontineReload._id,
        nom: tontineReload.nom
      },
      details: {
        mode: 'TEST COMPLET',
        etape1_notificationsEnvoyees: notificationsSent,
        etape2_delaiOptInMinutes: tontine.delaiOptIn,
        etape3_optInAutomatiques: optInAutoCount,
        etape4_membresEligibles: membresEligibles.length,
        etape5_tirageEffectue: true,
        etape6_resultatEnvoyee: true,
        message: 'Tirage TEST avec notification, opt-in, et resultats'
      }
    }, 'Tirage TEST effectue avec succes', 201);

  } catch (error) {
    logger.error('Erreur tirage TEST:', error);
    next(error);
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
  effectuerTirageAutomatiqueTest,  // ✅ NOUVEAU
  annulerTirage,
  listeTiragesTontine,
  mesGains,
  detailsTirage,
  notifyUpcomingTirage,
  optOutForTirage,
};