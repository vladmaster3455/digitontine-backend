// controllers/tontine.controller.js
const Tontine = require('../models/Tontine');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Tirage = require('../models/Tirage');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { getPaginationParams } = require('../utils/helpers');
const { TONTINE_STATUS, ROLES } = require('../config/constants');
const emailService = require('../services/email.service');

/**
 * @desc    Créer une nouvelle tontine
 * @route   POST /digitontine/tontines
 * @access  Admin
 * US 2.1 : Création de tontine
 */
const createTontine = async (req, res) => {
  try {
    const {
      nom,
      description,
      montantCotisation,
      frequence,
      dateDebut,
      dateFin,
      nombreMembresMin,
      nombreMembresMax,
      tauxPenalite,
      delaiGrace,
      tresorierAssigneId,
    } = req.body;
    const admin = req.user;

    const existingTontine = await Tontine.findOne({ nom });
    if (existingTontine) {
      return ApiResponse.conflict(res, 'Une tontine avec ce nom existe déjà');
    }

    if (tresorierAssigneId) {
      const tresorier = await User.findOne({ 
        _id: tresorierAssigneId, 
        role: ROLES.TRESORIER, 
        isActive: true 
      });
      
      if (!tresorier) {
        return ApiResponse.error(res, 'Trésorier introuvable ou inactif', 400);
      }
    }

    const tontine = await Tontine.create({
      nom,
      description,
      montantCotisation,
      frequence,
      dateDebut,
      dateFin,
      nombreMembresMin: nombreMembresMin || 3,
      nombreMembresMax: nombreMembresMax || 50,
      tauxPenalite: tauxPenalite || 5,
      delaiGrace: delaiGrace || 2,
      tresorierAssigne: tresorierAssigneId || null,
      statut: TONTINE_STATUS.EN_ATTENTE,
      createdBy: admin._id,
      membres: [],
    });

    logger.info(`Tontine créée - ${tontine.nom} par ${admin.email}`);

    return ApiResponse.success(
      res,
      {
        tontine: {
          id: tontine._id,
          nom: tontine.nom,
          description: tontine.description,
          montantCotisation: tontine.montantCotisation,
          frequence: tontine.frequence,
          dateDebut: tontine.dateDebut,
          dateFin: tontine.dateFin,
          statut: tontine.statut,
          nombreMembres: tontine.nombreMembres,
          nombreMembresMin: tontine.nombreMembresMin,
          nombreMembresMax: tontine.nombreMembresMax,
          tresorierAssigne: tresorierAssigneId || null,
        },
      },
      'Tontine créée avec succès',
      201
    );
  } catch (error) {
    logger.error('Erreur createTontine:', error);
    return ApiResponse.serverError(res);
  }
};

const addMembers = async (req, res) => {
  try {
    const { tontineId } = req.params;
    const { membresIds } = req.body;
    const admin = req.user;

    const tontine = await Tontine.findById(tontineId);
    if (!tontine) {
      return ApiResponse.notFound(res, 'Tontine introuvable');
    }

    if (tontine.statut !== TONTINE_STATUS.EN_ATTENTE) {
      return ApiResponse.error(
        res,
        'Impossible d\'ajouter des membres après activation',
        400
      );
    }

    const membresAjoutes = [];
    const erreurs = [];

    for (const userId of membresIds) {
      try {
        const user = await User.findById(userId);
        if (!user) {
          erreurs.push({ userId, message: 'Utilisateur introuvable' });
          continue;
        }

        if (!user.isActive) {
          erreurs.push({ userId, message: 'Compte désactivé' });
          continue;
        }

        if (user.role !== ROLES.MEMBRE) {
          erreurs.push({ userId, message: 'Seuls les membres peuvent être ajoutés' });
          continue;
        }

        tontine.ajouterMembre(userId);
        membresAjoutes.push({
          userId: user._id,
          nom: user.nomComplet,
          email: user.email,
        });

        try {
          await emailService.sendTontineInvitation(user, tontine);
        } catch (emailError) {
          logger.error(`Erreur envoi email à ${user.email}:`, emailError);
        }
      } catch (error) {
        erreurs.push({ userId, message: error.message });
      }
    }

    tontine.lastModifiedBy = admin._id;
    await tontine.save();

    logger.info(
      `Membres ajoutés à ${tontine.nom} - ${membresAjoutes.length}/${membresIds.length} réussis`
    );

    return ApiResponse.success(res, {
      tontine: {
        id: tontine._id,
        nom: tontine.nom,
        nombreMembres: tontine.nombreMembres,
      },
      membresAjoutes,
      erreurs: erreurs.length > 0 ? erreurs : undefined,
    });
  } catch (error) {
    logger.error('Erreur addMembers:', error);
    return ApiResponse.serverError(res);
  }
};

const removeMember = async (req, res) => {
  try {
    const { tontineId, userId } = req.params;
    const admin = req.user;

    const tontine = await Tontine.findById(tontineId);
    if (!tontine) {
      return ApiResponse.notFound(res, 'Tontine introuvable');
    }

    const membre = tontine.membres.find((m) => m.userId.toString() === userId);
    if (!membre) {
      return ApiResponse.notFound(res, 'Ce membre ne fait pas partie de la tontine');
    }

    tontine.retirerMembre(userId);
    tontine.lastModifiedBy = admin._id;
    await tontine.save();

    const user = await User.findById(userId);
    if (user) {
      try {
        await emailService.sendTontineRemovalNotification(user, tontine);
      } catch (emailError) {
        logger.error('Erreur envoi email:', emailError);
      }
    }

    logger.info(`Membre retiré de ${tontine.nom} - UserID: ${userId}`);

    return ApiResponse.success(res, {
      message: 'Membre retiré avec succès',
      tontine: {
        id: tontine._id,
        nom: tontine.nom,
        nombreMembres: tontine.nombreMembres,
      },
    });
  } catch (error) {
    logger.error('Erreur removeMember:', error);
    
    if (error.message.includes('Impossible de retirer')) {
      return ApiResponse.error(res, error.message, 400);
    }
    
    return ApiResponse.serverError(res);
  }
};

const activateTontine = async (req, res) => {
  try {
    const { tontineId } = req.params;
    const admin = req.user;

    const tontine = await Tontine.findById(tontineId).populate(
      'membres.userId',
      'prenom nom email'
    );
    
    if (!tontine) {
      return ApiResponse.notFound(res, 'Tontine introuvable');
    }

    if (!tontine.tresorierAssigne) {
      return ApiResponse.error(
        res,
        'Impossible d\'activer : aucun trésorier assigné à la tontine',
        400
      );
    }

    tontine.activer();
    tontine.lastModifiedBy = admin._id;
    await tontine.save();

    for (const membre of tontine.membres) {
      try {
        await emailService.sendTontineActivationNotification(
          membre.userId,
          tontine
        );
      } catch (emailError) {
        logger.error(
          `Erreur envoi email à ${membre.userId.email}:`,
          emailError
        );
      }
    }

    logger.info(`Tontine activée - ${tontine.nom} par ${admin.email}`);

    return ApiResponse.success(res, {
      tontine: {
        id: tontine._id,
        nom: tontine.nom,
        statut: tontine.statut,
        dateActivation: tontine.dateActivation,
        nombreMembres: tontine.nombreMembres,
        calendrierCotisations: tontine.calendrierCotisations.slice(0, 5),
      },
    });
  } catch (error) {
    logger.error('Erreur activateTontine:', error);
    
    if (error.message.includes('n\'est pas en attente') || 
        error.message.includes('membres requis') ||
        error.message.includes('trésorier')) {
      return ApiResponse.error(res, error.message, 400);
    }
    
    return ApiResponse.serverError(res);
  }
};

const updateTontine = async (req, res) => {
  try {
    const { tontineId } = req.params;
    const admin = req.user;
    const updates = req.body;

    const tontine = await Tontine.findById(tontineId);
    if (!tontine) {
      return ApiResponse.notFound(res, 'Tontine introuvable');
    }

    if (tontine.statut === TONTINE_STATUS.EN_ATTENTE) {
      const allowedFields = [
        'nom',
        'description',
        'montantCotisation',
        'frequence',
        'dateDebut',
        'dateFin',
        'nombreMembresMin',
        'nombreMembresMax',
        'tauxPenalite',
        'delaiGrace',
        'tresorierAssigneId',
      ];

      for (const field of allowedFields) {
        if (updates[field] === undefined) continue;

        if (field === 'tresorierAssigneId') {
          if (updates.tresorierAssigneId) {
            const tresorier = await User.findOne({ 
              _id: updates.tresorierAssigneId, 
              role: ROLES.TRESORIER, 
              isActive: true 
            });
            
            if (!tresorier) {
              return ApiResponse.error(res, 'Trésorier introuvable ou inactif', 400);
            }
            
            tontine.historiqueModifications.push({
              modifiePar: admin._id,
              champModifie: 'tresorierAssigne',
              ancienneValeur: tontine.tresorierAssigne,
              nouvelleValeur: updates.tresorierAssigneId,
            });
            
            tontine.tresorierAssigne = updates.tresorierAssigneId;
          } else {
            tontine.tresorierAssigne = null;
          }
        } else {
          tontine.historiqueModifications.push({
            modifiePar: admin._id,
            champModifie: field,
            ancienneValeur: tontine[field],
            nouvelleValeur: updates[field],
          });

          tontine[field] = updates[field];
        }
      }
    } else {
      const allowedFieldsAfterActivation = ['description', 'tauxPenalite', 'delaiGrace'];

      for (const field of allowedFieldsAfterActivation) {
        if (updates[field] !== undefined) {
          tontine.historiqueModifications.push({
            modifiePar: admin._id,
            champModifie: field,
            ancienneValeur: tontine[field],
            nouvelleValeur: updates[field],
          });

          tontine[field] = updates[field];
        }
      }

      const forbiddenFields = [
        'nom',
        'montantCotisation', 
        'frequence', 
        'dateDebut', 
        'dateFin',
        'tresorierAssigneId'
      ];
      
      const attemptedForbidden = forbiddenFields.filter(
        (field) => updates[field] !== undefined
      );

      if (attemptedForbidden.length > 0) {
        logger.warn(
          `Tentative modification champs interdits après activation: ${attemptedForbidden.join(', ')}`
        );
      }
    }

    tontine.lastModifiedBy = admin._id;
    await tontine.save();

    logger.info(`Tontine modifiée - ${tontine.nom} par ${admin.email}`);

    return ApiResponse.success(res, {
      tontine: {
        id: tontine._id,
        nom: tontine.nom,
        description: tontine.description,
        montantCotisation: tontine.montantCotisation,
        frequence: tontine.frequence,
        statut: tontine.statut,
        tauxPenalite: tontine.tauxPenalite,
        delaiGrace: tontine.delaiGrace,
        tresorierAssigne: tontine.tresorierAssigne,
      },
    });
  } catch (error) {
    logger.error('Erreur updateTontine:', error);
    return ApiResponse.serverError(res);
  }
};

const blockTontine = async (req, res) => {
  try {
    const { tontineId } = req.params;
    const { motif } = req.body;
    const admin = req.user;

    const tontine = await Tontine.findById(tontineId).populate(
      'membres.userId',
      'prenom nom email'
    );
    
    if (!tontine) {
      return ApiResponse.notFound(res, 'Tontine introuvable');
    }

    tontine.bloquer();
    tontine.lastModifiedBy = admin._id;
    
    tontine.historiqueModifications.push({
      modifiePar: admin._id,
      champModifie: 'statut',
      ancienneValeur: TONTINE_STATUS.ACTIVE,
      nouvelleValeur: TONTINE_STATUS.BLOQUEE,
      notes: motif,
    });

    await tontine.save();

    for (const membre of tontine.membres) {
      try {
        await emailService.sendTontineBlockedNotification(
          membre.userId,
          tontine,
          motif
        );
      } catch (emailError) {
        logger.error(`Erreur envoi email:`, emailError);
      }
    }

    logger.info(`Tontine bloquée - ${tontine.nom} par ${admin.email} - Motif: ${motif}`);

    return ApiResponse.success(res, {
      message: 'Tontine bloquée avec succès',
      tontine: {
        id: tontine._id,
        nom: tontine.nom,
        statut: tontine.statut,
        motif,
      },
    });
  } catch (error) {
    logger.error('Erreur blockTontine:', error);
    
    if (error.message.includes('Seule une tontine active')) {
      return ApiResponse.error(res, error.message, 400);
    }
    
    return ApiResponse.serverError(res);
  }
};

const unblockTontine = async (req, res) => {
  try {
    const { tontineId } = req.params;
    const admin = req.user;

    const tontine = await Tontine.findById(tontineId).populate(
      'membres.userId',
      'prenom nom email'
    );
    
    if (!tontine) {
      return ApiResponse.notFound(res, 'Tontine introuvable');
    }

    tontine.reactiver();
    tontine.lastModifiedBy = admin._id;
    await tontine.save();

    for (const membre of tontine.membres) {
      try {
        await emailService.sendTontineUnblockedNotification(membre.userId, tontine);
      } catch (emailError) {
        logger.error(`Erreur envoi email:`, emailError);
      }
    }

    logger.info(`Tontine réactivée - ${tontine.nom} par ${admin.email}`);

    return ApiResponse.success(res, {
      message: 'Tontine réactivée avec succès',
      tontine: {
        id: tontine._id,
        nom: tontine.nom,
        statut: tontine.statut,
      },
    });
  } catch (error) {
    logger.error('Erreur unblockTontine:', error);
    
    if (error.message.includes('Seule une tontine bloquée')) {
      return ApiResponse.error(res, error.message, 400);
    }
    
    return ApiResponse.serverError(res);
  }
};

const closeTontine = async (req, res) => {
  try {
    const { tontineId } = req.params;
    const { genererRapport = true } = req.body;
    const admin = req.user;

    const tontine = await Tontine.findById(tontineId).populate(
      'membres.userId',
      'prenom nom email'
    );
    
    if (!tontine) {
      return ApiResponse.notFound(res, 'Tontine introuvable');
    }

    const tirages = await Tirage.find({ tontineId });
    if (tirages.length < tontine.membres.length) {
      return ApiResponse.error(
        res,
        `Impossible de clôturer : ${tontine.membres.length - tirages.length} membre(s) n'ont pas encore gagné`,
        400
      );
    }

    tontine.cloturer();
    tontine.lastModifiedBy = admin._id;
    await tontine.save();

    let rapportUrl = null;
    if (genererRapport) {
      try {
        logger.info(`Rapport final généré pour ${tontine.nom}`);
      } catch (pdfError) {
        logger.error('Erreur génération rapport:', pdfError);
      }
    }

    for (const membre of tontine.membres) {
      try {
        await emailService.sendTontineClosedNotification(
          membre.userId,
          tontine,
          rapportUrl
        );
      } catch (emailError) {
        logger.error(`Erreur envoi email:`, emailError);
      }
    }

    logger.info(`Tontine clôturée - ${tontine.nom} par ${admin.email}`);

    return ApiResponse.success(res, {
      message: 'Tontine clôturée avec succès',
      tontine: {
        id: tontine._id,
        nom: tontine.nom,
        statut: tontine.statut,
        dateCloture: tontine.dateCloture,
        stats: tontine.stats,
      },
      rapportUrl,
    });
  } catch (error) {
    logger.error('Erreur closeTontine:', error);
    
    if (error.message.includes('doivent avoir gagné')) {
      return ApiResponse.error(res, error.message, 400);
    }
    
    return ApiResponse.serverError(res);
  }
};

const deleteTontine = async (req, res) => {
  try {
    const { tontineId } = req.params;
    const { confirmation } = req.body;
    const admin = req.user;

    if (confirmation !== 'SUPPRIMER') {
      return ApiResponse.error(res, 'Vous devez taper "SUPPRIMER" pour confirmer', 400);
    }

    const tontine = await Tontine.findById(tontineId);
    if (!tontine) {
      return ApiResponse.notFound(res, 'Tontine introuvable');
    }

    if (tontine.statut === TONTINE_STATUS.ACTIVE || tontine.statut === TONTINE_STATUS.BLOQUEE) {
      return ApiResponse.error(
        res,
        'Impossible de supprimer une tontine active ou bloquée',
        400
      );
    }

    if (tontine.statut === TONTINE_STATUS.TERMINEE) {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      
      if (tontine.dateCloture > oneYearAgo) {
        return ApiResponse.error(
          res,
          'Une tontine terminée ne peut être supprimée qu\'après 1 an',
          400
        );
      }
    }

    logger.info(`Archivage des données de ${tontine.nom}`);

    await tontine.deleteOne();

    logger.info(`Tontine supprimée - ${tontine.nom} par ${admin.email}`);

    return ApiResponse.success(res, {
      message: 'Tontine supprimée avec succès',
      deletedTontine: {
        id: tontine._id,
        nom: tontine.nom,
      },
    });
  } catch (error) {
    logger.error('Erreur deleteTontine:', error);
    return ApiResponse.serverError(res);
  }
};

const listTontines = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const { statut, search, dateDebut, dateFin } = req.query;

    const query = {};

    if (statut) {
      query.statut = statut;
    }

    if (search) {
      query.$or = [
        { nom: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    if (dateDebut) {
      query.dateDebut = { $gte: new Date(dateDebut) };
    }

    if (dateFin) {
      query.dateFin = { $lte: new Date(dateFin) };
    }

    const [tontines, total] = await Promise.all([
      Tontine.find(query)
        .populate('createdBy', 'prenom nom email')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip),
      Tontine.countDocuments(query),
    ]);

    const [actives, enAttente, terminees, bloquees] = await Promise.all([
      Tontine.countDocuments({ statut: TONTINE_STATUS.ACTIVE }),
      Tontine.countDocuments({ statut: TONTINE_STATUS.EN_ATTENTE }),
      Tontine.countDocuments({ statut: TONTINE_STATUS.TERMINEE }),
      Tontine.countDocuments({ statut: TONTINE_STATUS.BLOQUEE }),
    ]);

    return ApiResponse.successWithPagination(
      res,
      tontines.map((t) => ({
        id: t._id,
        nom: t.nom,
        montantCotisation: t.montantCotisation,
        frequence: t.frequence,
        statut: t.statut,
        nombreMembres: t.nombreMembres,
        nombreMembresMin: t.nombreMembresMin,
        nombreMembresMax: t.nombreMembresMax,
        dateDebut: t.dateDebut,
        dateFin: t.dateFin,
        createdAt: t.createdAt,
        createdBy: t.createdBy,
      })),
      { page, limit, total },
      {
        compteurs: {
          actives,
          enAttente,
          terminees,
          bloquees,
          total,
        },
      }
    );
  } catch (error) {
    logger.error('Erreur listTontines:', error);
    return ApiResponse.serverError(res);
  }
};

const getTontineDetails = async (req, res) => {
  try {
    const { tontineId } = req.params;

    const tontine = await Tontine.findById(tontineId)
      .populate('membres.userId', 'prenom nom email numeroTelephone')
      .populate('createdBy', 'prenom nom email')
      .populate('lastModifiedBy', 'prenom nom email')
      .populate('tresorierAssigne', 'prenom nom email numeroTelephone');

    if (!tontine) {
      return ApiResponse.notFound(res, 'Tontine introuvable');
    }

    const tirages = await Tirage.find({ tontineId })
      .populate('beneficiaireId', 'prenom nom email')
      .sort({ numeroTirage: -1 })
      .limit(10);

    await tontine.updateStats();
    await tontine.save();

    return ApiResponse.success(res, {
      tontine: {
        id: tontine._id,
        nom: tontine.nom,
        description: tontine.description,
        montantCotisation: tontine.montantCotisation,
        frequence: tontine.frequence,
        dateDebut: tontine.dateDebut,
        dateFin: tontine.dateFin,
        dateActivation: tontine.dateActivation,
        dateCloture: tontine.dateCloture,
        statut: tontine.statut,
        tresorierAssigne: tontine.tresorierAssigne ? {
          id: tontine.tresorierAssigne._id,
          nom: tontine.tresorierAssigne.nomComplet,
          email: tontine.tresorierAssigne.email,
        } : null,
        membres: tontine.membres.map((m) => ({
          userId: m.userId._id,
          nom: m.userId.nomComplet,
          email: m.userId.email,
          numeroTelephone: m.userId.numeroTelephone,
          dateAjout: m.dateAjout,
          aGagne: m.aGagne,
          dateGain: m.dateGain,
          montantGagne: m.montantGagne,
        })),
        nombreMembres: tontine.nombreMembres,
        nombreMembresMin: tontine.nombreMembresMin,
        nombreMembresMax: tontine.nombreMembresMax,
        tauxPenalite: tontine.tauxPenalite,
        delaiGrace: tontine.delaiGrace,
        calendrierCotisations: tontine.calendrierCotisations.slice(0, 5),
        stats: tontine.stats,
        tiragesRecents: tirages.map((t) => ({
          numeroTirage: t.numeroTirage,
          beneficiaire: t.beneficiaireId.nomComplet,
          montantDistribue: t.montantDistribue,
          dateTirage: t.dateTirage,
          statutPaiement: t.statutPaiement,
        })),
        createdBy: tontine.createdBy,
        lastModifiedBy: tontine.lastModifiedBy,
        createdAt: tontine.createdAt,
        updatedAt: tontine.updatedAt,
        historiqueModifications: tontine.historiqueModifications.slice(-10),
      },
    });
  } catch (error) {
    logger.error('Erreur getTontineDetails:', error);
    return ApiResponse.serverError(res);
  }
};

const optInForTirage = async (req, res) => {
  try {
    const { tontineId } = req.params;
    const { participe } = req.body;
    const user = req.user;

    const tontine = await Tontine.findById(tontineId);
    if (!tontine) {
      return ApiResponse.notFound(res, 'Tontine introuvable');
    }

    if (tontine.statut !== TONTINE_STATUS.ACTIVE) {
      return ApiResponse.error(res, 'La tontine doit être active', 400);
    }

    const membre = tontine.membres.find(
      m => m.userId.toString() === user._id.toString()
    );
    
    if (!membre) {
      return ApiResponse.forbidden(res, 'Vous n\'êtes pas membre de cette tontine');
    }

    if (membre.aGagne) {
      return ApiResponse.error(res, 'Vous avez déjà gagné le tirage de cette tontine', 400);
    }

    const nouvelleParticipation = participe !== false;
    membre.participeTirage = nouvelleParticipation;
    membre.dateOptIn = Date.now();
    
    await tontine.save();

    logger.info(
      `${user.email} ${nouvelleParticipation ? 'participe' : 'ne participe pas'} au tirage ${tontine.nom}`
    );

    return ApiResponse.success(res, {
      message: nouvelleParticipation 
        ? 'Participation au prochain tirage confirmée' 
        : 'Vous ne participerez pas au prochain tirage',
      participeTirage: membre.participeTirage,
      dateOptIn: membre.dateOptIn,
    });
  } catch (error) {
    logger.error('Erreur opt-in tirage:', error);
    return ApiResponse.serverError(res);
  }
};

module.exports = {
  createTontine,
  addMembers,
  removeMember,
  activateTontine,
  updateTontine,
  blockTontine,
  unblockTontine,
  closeTontine,
  deleteTontine,
  listTontines,
  getTontineDetails,
  optInForTirage,
};