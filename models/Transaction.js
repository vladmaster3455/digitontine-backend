// models/Transaction.js
const mongoose = require('mongoose');
const { TRANSACTION_STATUS, TRANSACTION_TYPES, PAYMENT_METHODS } = require('../config/constants');

const TransactionSchema = new mongoose.Schema(
  {
    // Référence unique
    referenceTransaction: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Relations
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'L\'utilisateur est requis'],
      index: true,
    },
    tontineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tontine',
      required: [true, 'La tontine est requise'],
      index: true,
    },

    // Type et montant
    type: {
      type: String,
      enum: {
        values: Object.values(TRANSACTION_TYPES),
        message: 'Type de transaction invalide',
      },
      required: [true, 'Le type est requis'],
      default: TRANSACTION_TYPES.COTISATION,
    },
    montant: {
      type: Number,
      required: [true, 'Le montant est requis'],
      min: [1, 'Le montant doit être positif'],
      validate: {
        validator: Number.isInteger,
        message: 'Le montant doit être un nombre entier',
      },
    },
    montantCotisation: Number, // Montant de base sans pénalité
    montantPenalite: {
      type: Number,
      default: 0,
    },

    // Paiement
    moyenPaiement: {
      type: String,
      enum: {
        values: Object.values(PAYMENT_METHODS),
        message: 'Moyen de paiement invalide',
      },
      required: [true, 'Le moyen de paiement est requis'],
    },
    referencePaiement: String, // Référence du provider (Wave, Orange Money)
    
    // Statut
    statut: {
      type: String,
      enum: {
        values: Object.values(TRANSACTION_STATUS),
        message: 'Statut invalide',
      },
      default: TRANSACTION_STATUS.EN_ATTENTE,
      index: true,
    },

    // Dates
    dateTransaction: {
      type: Date,
      default: Date.now,
      index: true,
    },
    dateValidation: Date,
    dateRejet: Date,

    // Validation
    validePar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    motifRejet: String,

    // Reçu
    recuGenere: {
      type: Boolean,
      default: false,
    },
    recuUrl: String,

    // Échéance liée
    echeanceNumero: Number, // Numéro de l'échéance dans le calendrier
    dateEcheance: Date,
    joursRetard: {
      type: Number,
      default: 0,
    },

    // Notifications
    notificationEnvoyee: {
      type: Boolean,
      default: false,
    },

    // Métadonnées
    metadata: {
      ip: String,
      userAgent: String,
      device: String,
    },

    // Webhook (pour paiements mobiles)
    webhookData: mongoose.Schema.Types.Mixed,
    webhookReceived: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ========================================
// INDEXES COMPOSÉS
// ========================================
TransactionSchema.index({ userId: 1, tontineId: 1, dateTransaction: -1 });
TransactionSchema.index({ statut: 1, dateTransaction: -1 });
TransactionSchema.index({ tontineId: 1, statut: 1 });
TransactionSchema.index({ referenceTransaction: 1 }, { unique: true });

// ========================================
// VIRTUALS
// ========================================
TransactionSchema.virtual('estEnRetard').get(function () {
  return this.joursRetard > 0;
});

TransactionSchema.virtual('estValidee').get(function () {
  return this.statut === TRANSACTION_STATUS.VALIDEE;
});

TransactionSchema.virtual('estEnAttente').get(function () {
  return this.statut === TRANSACTION_STATUS.EN_ATTENTE;
});

TransactionSchema.virtual('estRejetee').get(function () {
  return this.statut === TRANSACTION_STATUS.REJETEE;
});

// ========================================
// MÉTHODES D'INSTANCE
// ========================================

/**
 * Valider une transaction
 */
TransactionSchema.methods.valider = async function (validateurId, notes) {
  this.statut = TRANSACTION_STATUS.VALIDEE;
  this.dateValidation = new Date();
  this.validePar = validateurId;
  if (notes) {
    this.metadata = { ...this.metadata, notesValidation: notes };
  }
  return await this.save();
};

/**
 * Rejeter une transaction
 */
TransactionSchema.methods.rejeter = async function (validateurId, motif) {
  this.statut = TRANSACTION_STATUS.REJETEE;
  this.dateRejet = new Date();
  this.validePar = validateurId;
  this.motifRejet = motif;
  return await this.save();
};

/**
 * Calculer les jours de retard
 */
TransactionSchema.methods.calculerRetard = function () {
  if (!this.dateEcheance) return 0;
  
  const maintenant = new Date();
  const echeance = new Date(this.dateEcheance);
  
  if (maintenant <= echeance) return 0;
  
  const diffTime = Math.abs(maintenant - echeance);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  this.joursRetard = diffDays;
  return diffDays;
};

// ========================================
// MÉTHODES STATIQUES
// ========================================

/**
 * Générer référence unique
 */
TransactionSchema.statics.genererReference = function () {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 9);
  return `TXN-${timestamp}-${random}`.toUpperCase();
};

/**
 * Statistiques par tontine
 */
TransactionSchema.statics.statistiquesParTontine = async function (tontineId) {
  return await this.aggregate([
    { $match: { tontineId: mongoose.Types.ObjectId(tontineId) } },
    {
      $group: {
        _id: '$statut',
        count: { $sum: 1 },
        montantTotal: { $sum: '$montant' },
      },
    },
  ]);
};

/**
 * Transactions en retard
 */
TransactionSchema.statics.transactionsEnRetard = async function (tontineId = null) {
  const query = {
    statut: TRANSACTION_STATUS.EN_ATTENTE,
    dateEcheance: { $lt: new Date() },
  };
  
  if (tontineId) {
    query.tontineId = tontineId;
  }
  
  return await this.find(query)
    .populate('userId', 'prenom nom email')
    .populate('tontineId', 'nom')
    .sort({ dateEcheance: 1 });
};

// ========================================
// HOOKS (MIDDLEWARE)
// ========================================

/**
 * Pre-save : Générer référence si inexistante
 */
TransactionSchema.pre('save', function (next) {
  if (!this.referenceTransaction) {
    this.referenceTransaction = this.constructor.genererReference();
  }
  
  // Calculer montantCotisation si non défini
  if (!this.montantCotisation && this.type === TRANSACTION_TYPES.COTISATION) {
    this.montantCotisation = this.montant - (this.montantPenalite || 0);
  }
  
  next();
});

/**
 * Pre-save : Calculer retard automatiquement
 */
TransactionSchema.pre('save', function (next) {
  if (this.dateEcheance && this.statut === TRANSACTION_STATUS.EN_ATTENTE) {
    this.calculerRetard();
  }
  next();
});

/**
 * Post-save : Log des changements de statut
 */
TransactionSchema.post('save', function (doc) {
  const AuditLog = mongoose.model('AuditLog');
  
  if (doc.isModified('statut')) {
    AuditLog.create({
      action: `TRANSACTION_${doc.statut.toUpperCase()}`,
      details: {
        transactionId: doc._id,
        reference: doc.referenceTransaction,
        montant: doc.montant,
        nouveauStatut: doc.statut,
      },
      user: doc.validePar || doc.userId,
    }).catch(err => console.error('Erreur log audit:', err));
  }
});

// ========================================
// EXPORT
// ========================================
module.exports = mongoose.model('Transaction', TransactionSchema);