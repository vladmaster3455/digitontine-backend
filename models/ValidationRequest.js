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
      enum: ['Admin'],
      default: 'Admin',
      required: true,
    },

    // Code OTP Admin (celui qui initie)
    adminOTP: {
      code: String,
      codeExpiry: Date,
      verified: { type: Boolean, default: false },
      verifiedAt: Date,
      attempts: { type: Number, default: 0 },
    },

    // Code OTP Trésorier
    tresorierOTP: {
      code: String,
      codeExpiry: Date,
      verified: { type: Boolean, default: false },
      verifiedAt: Date,
      attempts: { type: Number, default: 0 },
    },

    // Trésorier qui doit valider
    assignedTresorier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },

    // Statut global
    status: {
      type: String,
      enum: ['pending', 'admin_validated', 'completed', 'rejected', 'expired'],
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
 * Générer et hasher un code OTP à 6 chiffres
 */
ValidationRequestSchema.methods.generateOTP = function () {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
  return { plainCode: code, hashedCode };
};

/**
 * Définir l'OTP de l'Admin
 */
ValidationRequestSchema.methods.setAdminOTP = function () {
  const { plainCode, hashedCode } = this.generateOTP();
  this.adminOTP.code = hashedCode;
  this.adminOTP.codeExpiry = Date.now() + 15 * 60 * 1000; // 15 minutes
  this.adminOTP.verified = false;
  this.adminOTP.attempts = 0;
  return plainCode;
};

/**
 * Définir l'OTP du Trésorier
 */
ValidationRequestSchema.methods.setTresorierOTP = function () {
  const { plainCode, hashedCode } = this.generateOTP();
  this.tresorierOTP.code = hashedCode;
  this.tresorierOTP.codeExpiry = Date.now() + 15 * 60 * 1000; // 15 minutes
  this.tresorierOTP.verified = false;
  this.tresorierOTP.attempts = 0;
  return plainCode;
};

/**
 * Vérifier l'OTP de l'Admin
 */
ValidationRequestSchema.methods.verifyAdminOTP = function (code) {
  if (Date.now() > this.adminOTP.codeExpiry) {
    return { success: false, message: 'Code Admin expiré' };
  }

  if (this.adminOTP.attempts >= 3) {
    return { success: false, message: 'Nombre maximum de tentatives atteint' };
  }

  const hashedInput = crypto.createHash('sha256').update(code).digest('hex');
  this.adminOTP.attempts += 1;

  if (hashedInput === this.adminOTP.code) {
    this.adminOTP.verified = true;
    this.adminOTP.verifiedAt = Date.now();
    this.status = 'admin_validated';
    return { success: true, message: 'Code Admin validé' };
  }

  return { success: false, message: 'Code Admin incorrect' };
};

/**
 * Vérifier l'OTP du Trésorier
 */
ValidationRequestSchema.methods.verifyTresorierOTP = function (code) {
  if (Date.now() > this.tresorierOTP.codeExpiry) {
    return { success: false, message: 'Code Trésorier expiré' };
  }

  if (this.tresorierOTP.attempts >= 3) {
    return { success: false, message: 'Nombre maximum de tentatives atteint' };
  }

  const hashedInput = crypto.createHash('sha256').update(code).digest('hex');
  this.tresorierOTP.attempts += 1;

  if (hashedInput === this.tresorierOTP.code) {
    this.tresorierOTP.verified = true;
    this.tresorierOTP.verifiedAt = Date.now();
    
    // ✅ Si Admin a déjà validé, on passe à completed
    if (this.adminOTP.verified) {
      this.status = 'completed';
      this.completedAt = Date.now();
    }
    
    return { success: true, message: 'Code Trésorier validé' };
  }

  return { success: false, message: 'Code Trésorier incorrect' };
};

/**
 * Marquer comme expiré
 */
ValidationRequestSchema.methods.markAsExpired = function () {
  this.status = 'expired';
  this.expiredAt = Date.now();
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
    status: { $in: ['pending', 'admin_validated'] },
  });
  return count > 0;
};

/**
 * Nettoyer les demandes expirées
 */
ValidationRequestSchema.statics.cleanupExpired = async function () {
  const now = Date.now();
  
  const expired = await this.find({
    status: { $in: ['pending', 'admin_validated'] },
    $or: [
      { 'adminOTP.codeExpiry': { $lt: now } },
      { 'tresorierOTP.codeExpiry': { $lt: now } },
    ],
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