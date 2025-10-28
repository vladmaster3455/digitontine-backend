// models/AuditLog.js
const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema(
  {
    // Utilisateur qui a effectué l'action
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    userEmail: {
      type: String,
      required: [true, 'L\'email utilisateur est requis'],
      index: true,
    },
userRole: {
  type: String,
  enum: ['admin', 'tresorier', 'membre', 'Système'], //  minuscules
},
    // Action effectuée
    action: {
      type: String,
      required: [true, 'L\'action est requise'],
      enum: [
        // Utilisateurs
        'CREATE_USER',
        'UPDATE_USER',
        'DELETE_USER',
        'ACTIVATE_USER',
        'DEACTIVATE_USER',
        'RESET_PASSWORD',
        'CHANGE_PASSWORD',
        'LOGIN',
        'LOGOUT',
        'LOGIN_FAILED',

        // Tontines
        'CREATE_TONTINE',
        'UPDATE_TONTINE',
        'DELETE_TONTINE',
        'ACTIVATE_TONTINE',
        'BLOCK_TONTINE',
        'UNBLOCK_TONTINE',
        'CLOSE_TONTINE',
        'ADD_MEMBER_TONTINE',
        'REMOVE_MEMBER_TONTINE',

        // Transactions
        'CREATE_TRANSACTION',
        'VALIDATE_TRANSACTION',
        'REJECT_TRANSACTION',
        'PAYMENT_RECEIVED',
        'PAYMENT_FAILED',

        // Tirages
        'CREATE_TIRAGE',
        'VALIDATE_TIRAGE',
        'PAY_TIRAGE',

        // Pénalités
        'CREATE_PENALITE',
        'REQUEST_PENALTY_EXEMPTION',
        'APPROVE_PENALTY_EXEMPTION',
        'REJECT_PENALTY_EXEMPTION',
        'PAY_PENALITE',

        // Système
        'ERROR',
        'SYSTEM_ACTION',
      ],
      index: true,
    },

    // Ressource affectée
    resource: {
      type: String,
      required: [true, 'La ressource est requise'],
      enum: ['User', 'Tontine', 'Transaction', 'Tirage', 'Penalite', 'System'],
      index: true,
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
    },

    // Détails de la requête
    details: {
      method: String, // GET, POST, PUT, DELETE
      url: String,
      ip: {
        type: String,
        index: true,
      },
      userAgent: String,
      body: mongoose.Schema.Types.Mixed,
      params: mongoose.Schema.Types.Mixed,
      query: mongoose.Schema.Types.Mixed,
    },

    // Résultat
    statusCode: Number,
    success: {
      type: Boolean,
      default: true,
    },
    errorMessage: String,

    // Données avant/après (pour modifications)
    changeDetails: {
      before: mongoose.Schema.Types.Mixed,
      after: mongoose.Schema.Types.Mixed,
      changedFields: [String],
    },

    // Métadonnées
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    duration: Number, // Durée de l'opération en ms

    // Niveau de sévérité
    severity: {
      type: String,
      enum: ['info', 'warning', 'error', 'critical'],
      default: 'info',
      index: true,
    },

    // Tags pour recherche
    tags: [String],

    // Session
    sessionId: String,
  },
  {
    timestamps: false, // On utilise notre propre timestamp
    capped: { size: 104857600, max: 100000 }, // 100MB max, 100k documents max
  }
);

// ========================================
// INDEXES COMPOSÉS
// ========================================
AuditLogSchema.index({ timestamp: -1 });
AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });
AuditLogSchema.index({ resource: 1, resourceId: 1 });
AuditLogSchema.index({ 'details.ip': 1, timestamp: -1 });
AuditLogSchema.index({ severity: 1, timestamp: -1 });

// Index TTL : supprimer automatiquement après 90 jours
AuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 }); // 90 jours

// ========================================
// MÉTHODES STATIQUES
// ========================================

/**
 * Logger une action utilisateur
 */
AuditLogSchema.statics.logUserAction = async function (data) {
  try {
    await this.create({
      userId: data.userId,
      userEmail: data.userEmail,
      userRole: data.userRole,
      action: data.action,
      resource: data.resource,
      resourceId: data.resourceId || null,
      details: {
        method: data.method,
        url: data.url,
        ip: data.ip,
        userAgent: data.userAgent,
        body: data.body || {},
        params: data.params || {},
        query: data.query || {},
      },
      statusCode: data.statusCode || 200,
      success: data.success !== false,
      severity: data.severity || 'info',
      tags: data.tags || [],
    });
  } catch (error) {
    console.error('❌ Erreur lors du logging audit:', error);
  }
};

/**
 * Logger une erreur
 */
AuditLogSchema.statics.logError = async function (error, req, user = null) {
  try {
    await this.create({
      userId: user ? user._id : null,
      userEmail: user ? user.email : 'Système',
      userRole: user ? user.role : 'Système',
      action: 'ERROR',
      resource: 'System',
      details: {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        body: req.body || {},
      },
      statusCode: error.statusCode || 500,
      success: false,
      errorMessage: error.message,
      severity: 'error',
      tags: ['error'],
    });
  } catch (logError) {
    console.error('❌ Erreur lors du logging d\'erreur:', logError);
  }
};

/**
 * Obtenir les logs d'un utilisateur
 */
AuditLogSchema.statics.getByUser = function (userId, options = {}) {
  const { limit = 50, skip = 0, startDate, endDate } = options;

  const query = { userId };

  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }

  return this.find(query)
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip(skip)
    .select('-details.body -details.params');
};

/**
 * Obtenir les logs d'une ressource
 */
AuditLogSchema.statics.getByResource = function (resource, resourceId, options = {}) {
  const { limit = 50, skip = 0 } = options;

  return this.find({ resource, resourceId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip(skip)
    .populate('userId', 'prenom nom email');
};

/**
 * Recherche avancée
 */
AuditLogSchema.statics.search = function (filters = {}) {
  const query = {};

  if (filters.userId) query.userId = filters.userId;
  if (filters.action) query.action = filters.action;
  if (filters.resource) query.resource = filters.resource;
  if (filters.severity) query.severity = filters.severity;
  if (filters.success !== undefined) query.success = filters.success;

  if (filters.startDate || filters.endDate) {
    query.timestamp = {};
    if (filters.startDate) query.timestamp.$gte = new Date(filters.startDate);
    if (filters.endDate) query.timestamp.$lte = new Date(filters.endDate);
  }

  if (filters.ip) query['details.ip'] = filters.ip;

  return this.find(query)
    .sort({ timestamp: -1 })
    .limit(filters.limit || 100)
    .skip(filters.skip || 0)
    .populate('userId', 'prenom nom email role');
};

/**
 * Statistiques d'audit
 */
AuditLogSchema.statics.getStats = async function (filters = {}) {
  const match = {};

  if (filters.startDate || filters.endDate) {
    match.timestamp = {};
    if (filters.startDate) match.timestamp.$gte = new Date(filters.startDate);
    if (filters.endDate) match.timestamp.$lte = new Date(filters.endDate);
  }

  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          action: '$action',
          success: '$success',
        },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: '$_id.action',
        total: { $sum: '$count' },
        success: {
          $sum: {
            $cond: ['$_id.success', '$count', 0],
          },
        },
        failed: {
          $sum: {
            $cond: ['$_id.success', 0, '$count'],
          },
        },
      },
    },
    { $sort: { total: -1 } },
  ]);

  return stats;
};

/**
 * Détection d'activités suspectes
 */
AuditLogSchema.statics.detectSuspiciousActivity = async function () {
  const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Tentatives de connexion échouées multiples
  const failedLogins = await this.aggregate([
    {
      $match: {
        action: 'LOGIN_FAILED',
        timestamp: { $gte: last24Hours },
      },
    },
    {
      $group: {
        _id: { userEmail: '$userEmail', ip: '$details.ip' },
        count: { $sum: 1 },
        lastAttempt: { $max: '$timestamp' },
      },
    },
    {
      $match: { count: { $gte: 5 } },
    },
  ]);

  // Actions inhabituelles (beaucoup de suppressions)
  const massiveDeletions = await this.aggregate([
    {
      $match: {
        action: { $in: ['DELETE_USER', 'DELETE_TONTINE'] },
        timestamp: { $gte: last24Hours },
      },
    },
    {
      $group: {
        _id: '$userId',
        count: { $sum: 1 },
      },
    },
    {
      $match: { count: { $gte: 10 } },
    },
  ]);

  return {
    failedLogins,
    massiveDeletions,
  };
};

/**
 * Nettoyer les vieux logs (manuellement si TTL ne suffit pas)
 */
AuditLogSchema.statics.cleanup = async function (daysToKeep = 90) {
  const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

  const result = await this.deleteMany({
    timestamp: { $lt: cutoffDate },
    severity: { $in: ['info', 'warning'] }, // Garder les erreurs critiques
  });

  return result;
};


module.exports = mongoose.model('AuditLog', AuditLogSchema);