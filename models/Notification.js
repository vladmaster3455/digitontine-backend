// models/Notification.js
const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    // Destinataire
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Type de notification
    type: {
      type: String,
      enum: [
        'VALIDATION_REQUEST',   // Demande de validation
        'TIRAGE_NOTIFICATION',     // Notification de tirage à venir
        'TIRAGE_RESULTAT',         // Résultat du tirage
        'TIRAGE_GAGNANT',          // Tu as gagné !
        'COTISATION_RAPPEL',       // Rappel de cotisation
        'COTISATION_VALIDEE',      // Cotisation validée
        'COTISATION_REJETEE',      // Cotisation rejetée
        'TONTINE_INVITATION',      // Invitation à une tontine
        'TONTINE_ACTIVATION',      // Tontine activée
        'TONTINE_BLOQUEE',         // Tontine bloquée
        'TONTINE_CLOTUREE',        // Tontine clôturée
        'SYSTEM',                  // Notification système
      ],
      required: true,
    },

    // Contenu
    titre: {
      type: String,
      required: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      maxlength: 2500,
    },

    // Données contextuelles
    data: {
        validationRequestId: { //  AJOUTER EN PREMIER
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ValidationRequest',
      },
      tontineId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tontine',
      },
      tirageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tirage',
      },
      transactionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Transaction',
      },
      dateTirage: Date,           // Date prévue du tirage
      dateExpiration: Date,        // Date limite pour accepter/refuser
      delaiOptInMinutes: Number,   // Délai en minutes
      montant: Number,
      action: String,              // 'opt_in', 'opt_out', 'view', etc.
    },

    // Statut
    lu: {
      type: Boolean,
      default: false,
    },
    dateLecture: Date,

    // Pour les notifications de tirage
    requiresAction: {
      type: Boolean,
      default: false,
      description: 'True si notification nécessite accepter/refuser',
    },
    actionTaken: {
      type: String,
      enum: ['accepted', 'refused', 'expired', null],
      default: null,
    },
    dateAction: Date,

    // Métadonnées
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    expiresAt: {
      type: Date,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// ========================================
// INDEXES
// ========================================
NotificationSchema.index({ userId: 1, lu: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, type: 1 });
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Auto-delete après expiration

// ========================================
// MÉTHODES D'INSTANCE
// ========================================

/**
 * Marquer comme lu
 */
NotificationSchema.methods.markAsRead = function () {
  if (!this.lu) {
    this.lu = true;
    this.dateLecture = Date.now();
  }
};

/**
 * Enregistrer une action (accepter/refuser)
 */
NotificationSchema.methods.recordAction = function (action) {
  if (!['accepted', 'refused'].includes(action)) {
    throw new Error('Action invalide');
  }
  
  this.actionTaken = action;
  this.dateAction = Date.now();
  this.lu = true;
  this.dateLecture = Date.now();
};

/**
 * Vérifier si la notification est expirée
 */
NotificationSchema.methods.isExpired = function () {
  if (!this.expiresAt) return false;
  return Date.now() > this.expiresAt.getTime();
};

// ========================================
// MÉTHODES STATIQUES
// ========================================

/**
 * Obtenir notifications non lues d'un utilisateur
 */
NotificationSchema.statics.getUnreadCount = async function (userId) {
  return await this.countDocuments({ userId, lu: false });
};

/**
 * Obtenir notifications d'un utilisateur (paginées)
 */
NotificationSchema.statics.getUserNotifications = async function (userId, options = {}) {
  const {
    page = 1,
    limit = 20,
    type = null,
    lu = null,
  } = options;

  const query = { userId };
  if (type) query.type = type;
  if (lu !== null) query.lu = lu;

  const skip = (page - 1) * limit;

  const notifications = await this.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('data.tontineId', 'nom')
    .lean();

  const total = await this.countDocuments(query);

  return {
    notifications,
    total,
    page,
    pages: Math.ceil(total / limit),
  };
};

/**
 * Marquer toutes les notifications comme lues
 */
NotificationSchema.statics.markAllAsRead = async function (userId) {
  return await this.updateMany(
    { userId, lu: false },
    { 
      $set: { 
        lu: true, 
        dateLecture: Date.now() 
      } 
    }
  );
};

/**
 * Supprimer les notifications expirées
 */
NotificationSchema.statics.deleteExpired = async function () {
  return await this.deleteMany({
    expiresAt: { $lt: Date.now() },
  });
};

/**
 * Créer une notification de tirage
 */
NotificationSchema.statics.createTirageNotification = async function (userId, tontine, dateTirage, delaiOptIn) {
  const dateExpiration = new Date(Date.now() + delaiOptIn * 60 * 1000);
  
  return await this.create({
    userId,
    type: 'TIRAGE_NOTIFICATION',
    titre: ` Tirage à venir - ${tontine.nom}`,
    message: `Un tirage au sort aura lieu bientôt. Confirmez votre participation avant le ${dateExpiration.toLocaleString('fr-FR')} (délai : ${delaiOptIn} min).`,
    data: {
      tontineId: tontine._id,
      dateTirage,
      dateExpiration,
      delaiOptInMinutes: delaiOptIn,
      montant: tontine.montantCotisation * tontine.membres.length,
      action: 'opt_in_tirage',
    },
    requiresAction: true,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Expire après 7 jours
  });
};

/**
 * Créer notification de résultat de tirage
 */
NotificationSchema.statics.createTirageResultNotification = async function (userId, tirage, tontine, gagnant) {
  return await this.create({
    userId,
    type: 'TIRAGE_RESULTAT',
    titre: ` Résultat du tirage - ${tontine.nom}`,
    message: `Le gagnant du tirage est ${gagnant.prenom} ${gagnant.nom}. Montant : ${tirage.montantDistribue} FCFA.`,
    data: {
      tontineId: tontine._id,
      tirageId: tirage._id,
      montant: tirage.montantDistribue,
    },
    requiresAction: false,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Expire après 30 jours
  });
};

/**
 * Créer notification de gain
 */
NotificationSchema.statics.createTirageWinnerNotification = async function (userId, tirage, tontine) {
  return await this.create({
    userId,
    type: 'TIRAGE_GAGNANT',
    titre: ` FÉLICITATIONS ! Vous avez gagné !`,
    message: `Vous avez gagné le tirage de "${tontine.nom}" ! Montant : ${tirage.montantDistribue} FCFA.`,
    data: {
      tontineId: tontine._id,
      tirageId: tirage._id,
      montant: tirage.montantDistribue,
    },
    requiresAction: false,
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // Expire après 90 jours
  });
};
/**
 * Créer une notification d'invitation à une tontine
 */
/**
 * Créer une notification d'invitation à une tontine
 */
NotificationSchema.statics.createInvitationTontine = async function (userId, tontine) {
  return await this.create({
    userId,
    type: 'TONTINE_INVITATION',
    titre: ` Invitation à rejoindre "${tontine.nom}"`,
    message: tontine.reglement || tontine.description, //  NOUVEAU CODE
    data: {
      tontineId: tontine._id,
      montant: tontine.montantCotisation,
      frequence: tontine.frequence,
      nombreMembres: tontine.membres.length,
      nombreMembresMax: tontine.nombreMembresMax,
      dateDebut: tontine.dateDebut,
    },
    requiresAction: true,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Expire après 30 jours
  });
};
/**
 * Créer une notification d'invitation à une tontine
 */
NotificationSchema.statics.createInvitationTontine = async function (userId, tontine) {
  // ... code existant
};

//  AJOUTER ICI
/**
 * Créer notification de demande de validation
 */
NotificationSchema.statics.createValidationRequestNotification = async function (
  tresorier,
  admin,
  validationRequest,
  actionType,
  resourceName
) {
  const actionLabels = {
    DELETE_USER: 'Suppression d\'utilisateur',
    DELETE_TONTINE: 'Suppression de tontine',
    BLOCK_TONTINE: 'Blocage de tontine',
    UNBLOCK_TONTINE: 'Déblocage de tontine',
    ACTIVATE_USER: 'Activation d\'utilisateur',
    DEACTIVATE_USER: 'Désactivation d\'utilisateur',
  };

  return await this.create({
    userId: tresorier._id,
    type: 'VALIDATION_REQUEST',
    titre: ` Validation requise - ${actionLabels[actionType]}`,
    message: `L'Admin ${admin.prenom} ${admin.nom} demande votre autorisation pour : ${actionLabels[actionType]} - ${resourceName}. Raison : ${validationRequest.reason}`,
    data: {
      validationRequestId: validationRequest._id,
      actionType,
      resourceName,
      adminId: admin._id,
      adminName: `${admin.prenom} ${admin.nom}`,
    },
    requiresAction: true,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
  });
};


module.exports = mongoose.model('Notification', NotificationSchema);