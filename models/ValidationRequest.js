// models/ValidationRequest.js - LOGIQUE CORRIGÉE
const mongoose = require('mongoose');
const crypto = require('crypto');

const ValidationRequestSchema = new mongoose.Schema(
  {
    // Type d'action à valider
    actionType: {
      type: String,
      enum: [
        'DELETE_USER',
        'DELETE_TONTINE',
        'BLOCK_TONTINE',
        'UNBLOCK_TONTINE',
        'ACTIVATE_USER',
        'DEACTIVATE_USER',
      ],
      required: true,
      index: true,
    },

    // Ressource concernée
    resourceType: {
      type: String,
      enum: ['User', 'Tontine'],
      required: true,
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'resourceType',
      index: true,
    },

    // Initiateur (Admin qui veut faire l'action)
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
initiatedByRole: {
  type: String,
  enum: ['admin'], //  minuscule
  default: 'admin',
  required: true,
},

   

    // Trésorier qui doit valider
    assignedTresorier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    notificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Notification',
    },

   status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'expired'], // Changé
      default: 'pending',
      index: true,
    },

    // Raison de l'action
    reason: {
      type: String,
      required: true,
      minlength: 10,
      maxlength: 500,
    },

    // Données supplémentaires
    metadata: {
      resourceName: String,
      resourceEmail: String,
      additionalInfo: mongoose.Schema.Types.Mixed,
    },

    // Résultat
    completedAt: Date,
    rejectedAt: Date,
    rejectionReason: String,
     expiresAt: {
      type: Date,
      default: () => Date.now() + 24 * 60 * 60 * 1000, // 24 heures
    },
    expiredAt: Date,

    // Notifications envoyées
    notificationsSent: {
      adminOTPSent: { type: Boolean, default: false },
      tresorierOTPSent: { type: Boolean, default: false },
      completed: { type: Boolean, default: false },
    },
  },
  {
    timestamps: true,
  }
);

// INDEXES
ValidationRequestSchema.index({ status: 1, createdAt: -1 });
ValidationRequestSchema.index({ initiatedBy: 1, status: 1 });
ValidationRequestSchema.index({ assignedTresorier: 1, status: 1 });
ValidationRequestSchema.index({ actionType: 1, resourceId: 1 });

// METHODES D'INSTANCE



/**
 * Marquer comme expiré
 */
ValidationRequestSchema.methods.markAsExpired = function () {
  this.status = 'expired';
  this.expiredAt = Date.now();
};


/**
 * Accepter la demande
 */
ValidationRequestSchema.methods.accept = function () {
  this.status = 'accepted';
  this.completedAt = Date.now();
};


/**
 * Rejeter la demande
 */
ValidationRequestSchema.methods.reject = function (reason) {
  this.status = 'rejected';
  this.rejectedAt = Date.now();
  this.rejectionReason = reason;
};

// METHODES STATIQUES

/**
 * Obtenir les demandes en attente pour un Trésorier
 */
ValidationRequestSchema.statics.getPendingForTresorier = function (tresorierid) {
  return this.find({
    assignedTresorier: tresorierid,
    status: { $in: ['pending', 'admin_validated'] },
  })
    .populate('initiatedBy', 'prenom nom email role')
    .populate('resourceId')
    .sort({ createdAt: -1 });
};

/**
 * Obtenir les demandes d'un Admin
 */
ValidationRequestSchema.statics.getByAdmin = function (adminId) {
  return this.find({ initiatedBy: adminId })
    .populate('assignedTresorier', 'prenom nom email')
    .sort({ createdAt: -1 });
};

/**
 * Vérifier si une demande existe déjà
 */
ValidationRequestSchema.statics.existsPending = async function (actionType, resourceId) {
  const count = await this.countDocuments({
    actionType,
    resourceId,
    status: 'pending', // Changé
  });
  return count > 0;
};

/**
 * Nettoyer les demandes expirées
 */
ValidationRequestSchema.statics.cleanupExpired = async function () {
  const now = Date.now();
  
  const expired = await this.find({
    status: 'pending', // Changé
    expiresAt: { $lt: now }, // Changé
  });

  for (const request of expired) {
    request.markAsExpired();
    await request.save();
  }

  return expired.length;
};

/**
 * Statistiques des validations
 */
ValidationRequestSchema.statics.getStats = async function (filters = {}) {
  const match = {};
  
  if (filters.dateDebut || filters.dateFin) {
    match.createdAt = {};
    if (filters.dateDebut) match.createdAt.$gte = new Date(filters.dateDebut);
    if (filters.dateFin) match.createdAt.$lte = new Date(filters.dateFin);
  }

  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  return stats;
};

module.exports = mongoose.model('ValidationRequest', ValidationRequestSchema);