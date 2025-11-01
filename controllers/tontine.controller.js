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
 * @desc    Creer une nouvelle tontine
 * @route   POST /digitontine/tontines
 * @access  Admin
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
    
    if (montantCotisation <= 0) {
      return ApiResponse.error(res, 'Le montant de cotisation doit etre superieur a 0', 400);
    }
    
    const existingTontine = await Tontine.findOne({ nom });
    if (existingTontine) {
      return ApiResponse.conflict(res, 'Une tontine avec ce nom existe deja');
    }

    if (tresorierAssigneId) {
      const tresorier = await User.findOne({ 
        _id: tresorierAssigneId, 
        role: ROLES.TRESORIER, 
        isActive: true 
      });
      
      if (!tresorier) {
        return ApiResponse.error(res, 'Tresorier introuvable ou inactif', 400);
      }
    }

    //  ÉTAPE 1 : Créer la tontine VIDE (sans membres)
    const tontine = await Tontine.create({
      nom,
      description: '', // Vide, sera rempli après
      montantCotisation,
      frequence,
      dateDebut,
      dateFin,
      nombreMembresMin: nombreMembresMin || 1,
      nombreMembresMax: nombreMembresMax || 50,
      tauxPenalite: tauxPenalite || 5,
      delaiGrace: delaiGrace || 2,
      delaiOptIn: 15,
      tresorierAssigne: tresorierAssigneId || null,
      statut: TONTINE_STATUS.EN_ATTENTE,
      createdBy: admin._id,
      membres: [], //  Tableau vide au départ
    });

    //  ÉTAPE 2 : Générer règlement automatique
    const reglementGenere = tontine.genererReglement();

    // Stocker règlement + description complémentaire dans "reglement"
    tontine.reglement = description 
      ? `${reglementGenere}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n RÈGLES COMPLÉMENTAIRES\n\n${description}` 
      : reglementGenere;

    // Garder uniquement la description utilisateur dans "description"
    tontine.description = description || '';

    //  ÉTAPE 3 : SEUL L'ADMIN est ajouté automatiquement
    tontine.membres.push({
      userId: admin._id,
      dateAjout: Date.now(),
    });

    //  ÉTAPE 4 : ENVOYER INVITATION AU TRÉSORIER (si assigné)
    if (tresorierAssigneId && tresorierAssigneId.toString() !== admin._id.toString()) {
      const notificationService = require('../services/notification.service');
      
      const tresorier = await User.findById(tresorierAssigneId);
      if (tresorier) {
        try {
          await notificationService.sendInvitationTontine(tresorier, tontine);
          logger.info(` Invitation envoyée au Trésorier ${tresorier.email} pour "${tontine.nom}"`);
        } catch (notifError) {
          logger.error(` Erreur envoi invitation Trésorier:`, notifError);
        }
      }
    }

    await tontine.save();

    logger.info(
      ` Tontine créée - ${tontine.nom} par ${admin.email} ` +
      `(Admin auto-ajouté, ${tresorierAssigneId ? 'Trésorier invité' : 'pas de trésorier'})`
    );

    //  ÉTAPE 5 : Retourner la réponse
    return ApiResponse.success(
      res,
      {
        tontine: {
          id: tontine._id,
          nom: tontine.nom,
          description: tontine.description,
          reglement: tontine.reglement,
          montantCotisation: tontine.montantCotisation,
          frequence: tontine.frequence,
          dateDebut: tontine.dateDebut,
          dateFin: tontine.dateFin,
          statut: tontine.statut,
          nombreMembres: 1, //  Admin uniquement au départ
          nombreMembresMin: tontine.nombreMembresMin,
          nombreMembresMax: tontine.nombreMembresMax,
          tauxPenalite: tontine.tauxPenalite,
          delaiGrace: tontine.delaiGrace,
          tresorierAssigne: tresorierAssigneId || null,
        },
      },
      'Tontine créée avec succès' + 
      (tresorierAssigneId ? '. Le Trésorier a reçu une invitation.' : ''),
      201
    );
  } catch (error) {
    logger.error(' Erreur createTontine:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Mes tontines (Membre/Tresorier)
 * @route   GET /digitontine/tontines/me/tontines
 * @access  Private
 */
/**
 * @desc    Mes tontines (Membre/Tresorier)
 * @route   GET /digitontine/tontines/me/tontines
 * @access  Private
 */
// ✅ NOUVEAU CODE - Cherche dans membres OU tresorierAssigne
const mesTontines = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      logger.error('Erreur mesTontines: req.user non defini');
      return ApiResponse.error(res, 'Utilisateur non authentifie', 401);
    }

    const userId = req.user._id;
    const userRole = req.user.role;
    logger.info(`Recherche tontines pour userId: ${userId}, role: ${userRole}`);

    // ✅ CORRECTION : Requête différente selon le rôle
    let query = {};
    
    if (userRole === 'tresorier' || userRole === 'Tresorier') {
      // Trésorier : chercher dans tresorierAssigne OU membres
      query = {
        $or: [
          { tresorierAssigne: userId },
          { 'membres.userId': userId }
        ]
      };
    } else {
      // Membre : chercher uniquement dans membres
      query = { 'membres.userId': userId };
    }

    let tontines = await Tontine.find(query)
      .populate('tresorierAssigne', 'prenom nom')
      .select('nom description montantCotisation frequence statut membres dateDebut')
      .sort({ createdAt: -1 })
      .lean();

    if (!tontines) {
      logger.warn(`Aucune tontine trouvee pour userId: ${userId}`);
      tontines = [];
    }

    logger.info(`${tontines.length} tontine(s) trouvee(s) pour ${req.user.email}`);

    return ApiResponse.success(res, {
      tontines,
      total: tontines.length
    }, `${tontines.length} tontine(s) trouvee(s)`);
    
  } catch (error) {
    logger.error('Erreur mesTontines:', error);
    logger.error('Stack:', error.stack);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Ajouter des membres a une tontine
 * @route   POST /digitontine/tontines/:tontineId/membres
 * @access  Admin
 */
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
        'Impossible d\'ajouter des membres apres activation',
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
          erreurs.push({ userId, message: 'Compte desactive' });
          continue;
        }

        if (user.role !== ROLES.MEMBRE) {
          erreurs.push({ userId, message: 'Seuls les membres peuvent etre ajoutes' });
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
          logger.error(`Erreur envoi email a ${user.email}:`, emailError);
        }
      } catch (error) {
        erreurs.push({ userId, message: error.message });
      }
    }

    tontine.lastModifiedBy = admin._id;
    await tontine.save();

    logger.info(
      `Membres ajoutes a ${tontine.nom} - ${membresAjoutes.length}/${membresIds.length} reussis`
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

/**
 * @desc    Retirer un membre d'une tontine
 * @route   DELETE /digitontine/tontines/:tontineId/membres/:userId
 * @access  Admin
 */
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

    logger.info(`Membre retire de ${tontine.nom} - UserID: ${userId}`);

    return ApiResponse.success(res, {
      message: 'Membre retire avec succes',
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
// 
// 

const inviterMembres = async (req, res) => {
  try {
    const { tontineId } = req.params;
    const { membresIds, reglementTexte } = req.body;
    const admin = req.user;

    //  Validation
    if (!membresIds || !Array.isArray(membresIds) || membresIds.length === 0) {
      return ApiResponse.error(res, 'Aucun membre à inviter', 400);
    }

    const tontine = await Tontine.findById(tontineId);
    if (!tontine) {
      return ApiResponse.notFound(res, 'Tontine introuvable');
    }

    if (tontine.statut !== TONTINE_STATUS.EN_ATTENTE) {
      return ApiResponse.error(
        res,
        'Impossible d\'inviter des membres après activation',
        400
      );
    }

    const invitationsEnvoyees = [];
    const erreurs = [];
//  Mettre à jour le règlement si personnalisé
if (reglementTexte && reglementTexte.trim()) {
  tontine.reglement = reglementTexte.trim();
  await tontine.save();
  console.log(' Règlement personnalisé appliqué');
}
    for (const userId of membresIds) {
      try {
        console.log(`\n Traitement invitation pour userId: ${userId}`);

        const user = await User.findById(userId);
        if (!user) {
          console.error(` Utilisateur ${userId} introuvable`);
          erreurs.push({ userId, message: 'Utilisateur introuvable' });
          continue;
        }

        if (!user.isActive) {
          console.error(` Compte désactivé: ${user.email}`);
          erreurs.push({ userId, message: 'Compte désactivé' });
          continue;
        }

        if (user.role !== ROLES.MEMBRE) {
          console.error(`❌ Rôle invalide: ${user.role}`);
          erreurs.push({ userId, message: 'Seuls les membres peuvent être invités' });
          continue;
        }

        // Vérifier si déjà membre
        const estDejaMembre = tontine.membres.some(
          m => m.userId.toString() === userId.toString()
        );
        if (estDejaMembre) {
          console.error(`❌ Déjà membre: ${user.email}`);
          erreurs.push({ userId, message: 'Déjà membre de la tontine' });
          continue;
        }

        // ✅ CORRECTION: Créer notification d'invitation avec règlement
        const notificationService = require('../services/notification.service');
        const notifResult = await notificationService.sendInvitationTontine(user, tontine);

        console.log(`📬 Résultat notification:`, notifResult);

        // ✅ CORRECTION: Vérifier le succès correctement
        if (!notifResult.success || !notifResult.notification) {
          console.error(`❌ Erreur envoi notification:`, notifResult.error);
          erreurs.push({ 
            userId, 
            email: user.email,
            message: notifResult.error || 'Erreur envoi notification' 
          });
          continue;
        }

        // ✅ SUCCÈS - Ajouter aux invitations envoyées
        invitationsEnvoyees.push({
          userId: user._id,
          nom: user.nomComplet,
          email: user.email,
          notificationId: notifResult.notification._id,
        });

        console.log(` Invitation envoyée avec succès à ${user.email}`);
        logger.info(` Invitation envoyée à ${user.email} pour "${tontine.nom}"`);
        
      } catch (error) {
        console.error(` Exception pour ${userId}:`, error);
        erreurs.push({ userId, message: error.message });
      }
    }

    //  Log final
    const successCount = invitationsEnvoyees.length;
    const totalCount = membresIds.length;
    
    console.log(`\n RÉSULTAT FINAL:`);
    console.log(`    Réussies: ${successCount}/${totalCount}`);
    console.log(`    Erreurs: ${erreurs.length}`);

    logger.info(
      `Invitations tontine "${tontine.nom}" - ${successCount}/${totalCount} réussies`
    );

    return ApiResponse.success(res, {
      message: `${successCount} invitation(s) envoyée(s) avec succès`,
      tontine: {
        id: tontine._id,
        nom: tontine.nom,
      },
      invitationsEnvoyees,
      erreurs: erreurs.length > 0 ? erreurs : undefined,
    });
  } catch (error) {
    console.error(' Erreur globale inviterMembres:', error);
    logger.error('Erreur inviterMembres:', error);
    return ApiResponse.serverError(res);
  }
};
/**
 * @desc    Activer une tontine
 * @route   POST /digitontine/tontines/:tontineId/activate
 * @access  Admin
 */
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
        'Impossible d\'activer : aucun tresorier assigne a la tontine',
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
          `Erreur envoi email a ${membre.userId.email}:`,
          emailError
        );
      }
    }

    logger.info(`Tontine activee - ${tontine.nom} par ${admin.email}`);

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
        error.message.includes('tresorier')) {
      return ApiResponse.error(res, error.message, 400);
    }
    
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Modifier une tontine
 * @route   PUT /digitontine/tontines/:tontineId
 * @access  Admin
 */
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
              return ApiResponse.error(res, 'Tresorier introuvable ou inactif', 400);
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
          `Tentative modification champs interdits apres activation: ${attemptedForbidden.join(', ')}`
        );
      }
    }

    tontine.lastModifiedBy = admin._id;
    await tontine.save();

    logger.info(`Tontine modifiee - ${tontine.nom} par ${admin.email}`);

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

/**
 * @desc    Bloquer une tontine
 * @route   POST /digitontine/tontines/:tontineId/block
 * @access  Admin
 */
const blockTontine = async (req, res) => {
  try {
    const { tontineId } = req.params;
    const { motif, validationRequestId } = req.body;
    const admin = req.user;

    const tontine = await Tontine.findById(tontineId).populate(
      'membres.userId',
      'prenom nom email'
    );
    
    if (!tontine) {
      return ApiResponse.notFound(res, 'Tontine introuvable');
    }
    if (!validationRequestId) {
      return ApiResponse.error(
        res,
        'Cette action nécessite une validation. ',
        400
      );
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

    logger.info(`Tontine bloquee - ${tontine.nom} par ${admin.email} - Motif: ${motif}`);

    return ApiResponse.success(res, {
      message: 'Tontine bloquee avec succes',
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

/**
 * @desc    Debloquer/Reactiver une tontine
 * @route   POST /digitontine/tontines/:tontineId/unblock
 * @access  Admin
 */
const unblockTontine = async (req, res) => {
  try {
    const { tontineId } = req.params;
      const { validationRequestId } = req.body; 
    const admin = req.user;

    const tontine = await Tontine.findById(tontineId).populate(
      'membres.userId',
      'prenom nom email'
    );
    
    if (!tontine) {
      return ApiResponse.notFound(res, 'Tontine introuvable');
    }
    if (!validationRequestId) {
      return ApiResponse.error(
        res,
        'Cette action nécessite une validation. Créez une demande',
        400
      );
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

    logger.info(`Tontine reactivee - ${tontine.nom} par ${admin.email}`);

    return ApiResponse.success(res, {
      message: 'Tontine reactivee avec succes',
      tontine: {
        id: tontine._id,
        nom: tontine.nom,
        statut: tontine.statut,
      },
    });
  } catch (error) {
    logger.error('Erreur unblockTontine:', error);
    
    if (error.message.includes('Seule une tontine bloquee')) {
      return ApiResponse.error(res, error.message, 400);
    }
    
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Cloturer une tontine
 * @route   POST /digitontine/tontines/:tontineId/close
 * @access  Admin
 */
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
        `Impossible de cloturer : ${tontine.membres.length - tirages.length} membre(s) n'ont pas encore gagne`,
        400
      );
    }

    tontine.cloturer();
    tontine.lastModifiedBy = admin._id;
    await tontine.save();

    let rapportUrl = null;
    if (genererRapport) {
      try {
        logger.info(`Rapport final genere pour ${tontine.nom}`);
      } catch (pdfError) {
        logger.error('Erreur generation rapport:', pdfError);
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

    logger.info(`Tontine cloturee - ${tontine.nom} par ${admin.email}`);

    return ApiResponse.success(res, {
      message: 'Tontine cloturee avec succes',
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
    
    if (error.message.includes('doivent avoir gagne')) {
      return ApiResponse.error(res, error.message, 400);
    }
    
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Supprimer une tontine
 * @route   DELETE /digitontine/tontines/:tontineId
 * @access  Admin
 */
const deleteTontine = async (req, res) => {
  try {
    const { tontineId } = req.params;
    const { confirmation, validationRequestId } = req.body;
    const admin = req.user;

    if (confirmation !== 'SUPPRIMER') {
      return ApiResponse.error(res, 'Vous devez taper "SUPPRIMER" pour confirmer', 400);
    }

    const tontine = await Tontine.findById(tontineId);
    if (!tontine) {
      return ApiResponse.notFound(res, 'Tontine introuvable');
    }
     if (!validationRequestId) {
      return ApiResponse.error(
        res,
        'Cette action nécessite une validation. Créez une demande via /api/v1/validation/request',
        400
      );
    }

    if (tontine.statut === TONTINE_STATUS.ACTIVE || tontine.statut === TONTINE_STATUS.BLOQUEE) {
      return ApiResponse.error(
        res,
        'Impossible de supprimer une tontine active ou bloquee',
        400
      );
    }

    if (tontine.statut === TONTINE_STATUS.TERMINEE) {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      
      if (tontine.dateCloture > oneYearAgo) {
        return ApiResponse.error(
          res,
          'Une tontine terminee ne peut etre supprimee qu\'apres 1 an',
          400
        );
      }
    }

    logger.info(`Archivage des donnees de ${tontine.nom}`);

    await tontine.deleteOne();

    logger.info(`Tontine supprimee - ${tontine.nom} par ${admin.email}`);

    return ApiResponse.success(res, {
      message: 'Tontine supprimee avec succes',
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

/**
 * @desc    Liste des tontines avec filtres
 * @route   GET /digitontine/tontines
 * @access  Admin
 */

const listTontines = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const { statut, search, dateDebut, dateFin } = req.query;
    const admin = req.user;  // ← AJOUTER : Récupérer l'admin

    //  AJOUTER : Filtre createdBy
    const query = { createdBy: admin._id };

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

    // ✅ IMPORTANT : Aussi filtrer les compteurs !
    const [actives, enAttente, terminees, bloquees] = await Promise.all([
      Tontine.countDocuments({ createdBy: admin._id, statut: TONTINE_STATUS.ACTIVE }),
      Tontine.countDocuments({ createdBy: admin._id, statut: TONTINE_STATUS.EN_ATTENTE }),
      Tontine.countDocuments({ createdBy: admin._id, statut: TONTINE_STATUS.TERMINEE }),
      Tontine.countDocuments({ createdBy: admin._id, statut: TONTINE_STATUS.BLOQUEE }),
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
        message: 'Liste des tontines',
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
/**
 * @desc    Details d'une tontine (avec vérification de rôle automatique)
 * @route   GET /digitontine/tontines/:tontineId
 * @access  Private (tous les utilisateurs authentifiés)
 * 
 *  Si Admin/Trésorier → Retourne TOUS les détails
 *  Si Membre → Vérifie qu'il fait partie de la tontine, retourne détails limités
 */
// 
// NOUVEAU CODE - Vérifie si trésorier assigné OU membre
const getTontineDetailsWithRoleCheck = async (req, res) => {
  try {
    const { tontineId } = req.params;
    const currentUser = req.user;

    const tontine = await Tontine.findById(tontineId)
      .populate('membres.userId', 'prenom nom email numeroTelephone')
      .populate('tresorierAssigne', 'prenom nom email numeroTelephone');

    if (!tontine) {
      return ApiResponse.notFound(res, 'Tontine introuvable');
    }

    // ✅ CORRECTION : Normaliser le rôle
    const userRole = currentUser.role?.toLowerCase();

    // ✅ CAS 1 : Admin → Accès COMPLET
    if (userRole === 'admin' || userRole === 'administrateur') {
      logger.info(`Accès complet tontine ${tontine.nom} par Admin ${currentUser.email}`);
      return getTontineDetails(req, res);
    }

    // ✅ CAS 2 : Trésorier → Vérifier s'il est assigné OU membre
    if (userRole === 'tresorier') {
      const estTresorierAssigne = tontine.tresorierAssigne && 
        tontine.tresorierAssigne._id.toString() === currentUser._id.toString();
      
      const estMembreTontine = tontine.membres.some(
        m => m.userId._id.toString() === currentUser._id.toString()
      );

      if (estTresorierAssigne || estMembreTontine) {
        logger.info(`Accès trésorier tontine ${tontine.nom} par ${currentUser.email}`);
        return getTontineDetails(req, res);
      }

      logger.warn(`Trésorier ${currentUser.email} non assigné à ${tontine.nom}`);
      return ApiResponse.forbidden(res, 'Vous n\'êtes pas le trésorier de cette tontine');
    }

    // ✅ CAS 3 : Membre → Vérifier qu'il fait partie de la tontine
    const estMembre = tontine.membres.some(
      m => m.userId._id.toString() === currentUser._id.toString()
    );

    if (!estMembre) {
      logger.warn(`Tentative accès non autorisé tontine ${tontine.nom} par ${currentUser.email}`);
      return ApiResponse.forbidden(res, 'Vous n\'êtes pas membre de cette tontine');
    }

    logger.info(`Accès membre tontine ${tontine.nom} par ${currentUser.email}`);
    return getTontineDetailsForMember(req, res);

  } catch (error) {
    logger.error('Erreur getTontineDetailsWithRoleCheck:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Details d'une tontine
 * @route   GET /digitontine/tontines/:tontineId
 * @access  Admin
 */
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
        reglement: tontine.reglement,
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

/**
 * @desc    Confirmer participation au prochain tirage
 * @route   POST /digitontine/tontines/:tontineId/opt-in
 * @access  Private (Membre de la tontine)
 */
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
      return ApiResponse.error(res, 'La tontine doit etre active', 400);
    }

    const membre = tontine.membres.find(
      m => m.userId.toString() === user._id.toString()
    );
    
    if (!membre) {
      return ApiResponse.forbidden(res, 'Vous n\'etes pas membre de cette tontine');
    }

    if (membre.aGagne) {
      return ApiResponse.error(res, 'Vous avez deja gagne le tirage de cette tontine', 400);
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
        ? 'Participation au prochain tirage confirmee' 
        : 'Vous ne participerez pas au prochain tirage',
      participeTirage: membre.participeTirage,
      dateOptIn: membre.dateOptIn,
    });
  } catch (error) {
    logger.error('Erreur opt-in tirage:', error);
    return ApiResponse.serverError(res);
  }
};
/**
 * @desc    Details d'une tontine pour un membre
 * @route   GET /digitontine/tontines/:tontineId/details
 * @access  Private (Membre de la tontine)
 */
const getTontineDetailsForMember = async (req, res) => {
  try {
    const { tontineId } = req.params;
    const userId = req.user._id;

    const tontine = await Tontine.findById(tontineId)
      .populate('membres.userId', 'prenom nom email numeroTelephone')
      .populate('tresorierAssigne', 'prenom nom email numeroTelephone');

    if (!tontine) {
      return ApiResponse.notFound(res, 'Tontine introuvable');
    }

    // Verifier que l'utilisateur est membre
    const estMembre = tontine.membres.some(
      m => m.userId._id.toString() === userId.toString()
    );

    if (!estMembre && req.user.role !== 'Administrateur' && req.user.role !== 'Tresorier') {
      return ApiResponse.forbidden(res, 'Vous n\'etes pas membre de cette tontine');
    }

    const tirages = await Tirage.find({ tontineId })
      .populate('beneficiaire', 'prenom nom email')
      .sort({ dateEffective: -1 })
      .limit(10);

    return ApiResponse.success(res, {
      tontine: {
        id: tontine._id,
        nom: tontine.nom,
        description: tontine.description,
        montantCotisation: tontine.montantCotisation,
        frequence: tontine.frequence,
        dateDebut: tontine.dateDebut,
        statut: tontine.statut,
        nombreMembres: tontine.nombreMembres,
        tresorierAssigne: tontine.tresorierAssigne ? {
          id: tontine.tresorierAssigne._id,
          nom: tontine.tresorierAssigne.nomComplet,
          email: tontine.tresorierAssigne.email,
        } : null,
        membres: tontine.membres.map((m) => ({
          userId: m.userId._id,
          nom: m.userId.nomComplet,
          email: m.userId.email,
          aGagne: m.aGagne,
        })),
        tiragesRecents: tirages.map((t) => ({
          beneficiaire: t.beneficiaire?.nomComplet || 'N/A',
          montant: t.montant,
          dateEffective: t.dateEffective,
        })),
      },
    });
  } catch (error) {
    logger.error('Erreur getTontineDetailsForMember:', error);
    return ApiResponse.serverError(res);
  }
};
//  Dans tontine.controller.js - REMPLACER la fonction existante
//  REMPLACER la fonction getTontineInvitations dans tontine.controller.js

const getTontineInvitations = async (req, res) => {
  try {
    const { tontineId } = req.params;

    //  Vérifier que la tontine existe
    const tontine = await Tontine.findById(tontineId);
    if (!tontine) {
      return ApiResponse.notFound(res, 'Tontine introuvable');
    }

    const Notification = require('../models/Notification');
    
    //  CORRECTION : Utiliser $or avec ObjectId ET String
    const mongoose = require('mongoose');
    const invitations = await Notification.find({
      type: 'TONTINE_INVITATION',
      $or: [
        { 'data.tontineId': mongoose.Types.ObjectId(tontineId) },
        { 'data.tontineId': tontineId }, // Cas où c'est stocké en string
      ]
    })
    .populate('userId', 'prenom nom email')
    .sort({ createdAt: -1 })
    .lean();

    console.log(` ${invitations.length} invitation(s) trouvée(s) pour tontineId: ${tontineId}`);

    //  Enrichir les données
    const invitationsEnrichies = invitations.map(inv => ({
      notificationId: inv._id,
      memberId: inv.userId?._id,
      memberName: inv.userId ? `${inv.userId.prenom} ${inv.userId.nom}` : 'Utilisateur inconnu',
      memberEmail: inv.userId?.email || 'N/A',
      statut: inv.actionTaken || 'pending', // pending, accepted, refused
      dateEnvoyee: inv.createdAt,
      dateResponse: inv.dateAction,
      requiresAction: inv.requiresAction,
      lu: inv.lu,
    }));

    //  Calculer les compteurs
    const compteurs = {
      total: invitationsEnrichies.length,
      pending: invitationsEnrichies.filter(i => i.statut === 'pending').length,
      accepted: invitationsEnrichies.filter(i => i.statut === 'accepted').length,
      refused: invitationsEnrichies.filter(i => i.statut === 'refused').length,
    };

    return ApiResponse.success(res, {
      invitations: invitationsEnrichies,
      compteurs,
      total: invitationsEnrichies.length,
    }, `${invitationsEnrichies.length} invitation(s) trouvée(s)`);
    
  } catch (error) {
    logger.error(' Erreur getTontineInvitations:', error);
    return ApiResponse.serverError(res);
  }
};
module.exports = {
  createTontine,
  addMembers,
  removeMember,
  activateTontine,
  inviterMembres,
  updateTontine,
  blockTontine,
  unblockTontine,
  closeTontine,
  deleteTontine,
  listTontines,
  getTontineDetails,
  getTontineDetailsForMember,  
  getTontineInvitations, 
  getTontineDetailsWithRoleCheck,
  optInForTirage,
  mesTontines,
};