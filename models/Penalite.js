// models/Penalite.js
const mongoose = require('mongoose');

const PenaliteSchema = new mongoose.Schema(
  {
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
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      index: true,
    },

    // Informations de la pénalité
    montantPenalite: {
      type: Number,
      required: [true, 'Le montant de la pénalité est requis'],
      min: [0, 'Le montant doit être positif'],
    },
    montantCotisation: {
      type: Number,
      required: [true, 'Le montant de la cotisation est requis'],
    },
    tauxApplique: {
      type: Number,
      required: [true, 'Le taux de pénalité est requis'],
      min: [0, 'Le taux doit être positif'],
    },

    // Retard
    joursRetard: {
      type: Number,
      required: [true, 'Les jours de retard sont requis'],
      min: [1, 'Le retard doit être positif'],
    },
    dateEcheance: {
      type: Date,
      required: [true, 'La date d\'échéance est requise'],
    },
    dateCalcul: {
      type: Date,
      default: Date.now,
    },

    // Statut
    statut: {
      type: String,
      enum: ['active', 'payee', 'exoneree', 'annulee'],
      default: 'active',
      index: true,
    },
    datePaiement: Date,
    dateExoneration: Date,

    // Exonération
    exoneree: {
      type: Boolean,
      default: false,
    },
    raisonExoneration: String,
    demandeExonerationPar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    dateDemandeExoneration: Date,
    approuveeParAdmin: {
      type: Boolean,
      default: false,
    },
    approuveePar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    dateApprobation: Date,
    commentaireApprobation: String,

    // Paiement
    payeAvecTransaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
    },

    // Notifications
    notificationEnvoyee: {
      type: Boolean,
      default: false,
    },

    // Métadonnées
    calculeeAutomatiquement: {
      type: Boolean,
      default: true,
    },
    notes: String,
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
PenaliteSchema.index({ userId: 1, tontineId: 1, dateCalcul: -1 });
PenaliteSchema.index({ statut: 1 });
PenaliteSchema.index({ exoneree: 1, approuveeParAdmin: 1 });

// ========================================
// VIRTUALS
// ========================================
PenaliteSchema.virtual('estActive').get(function () {
  return this.statut === 'active';
});

PenaliteSchema.virtual('estPayee').get(function () {
  return this.statut === 'payee';
});

PenaliteSchema.virtual('estExoneree').get(function () {
  return this.statut === 'exoneree';
});

PenaliteSchema.virtual('enAttenteApprobation').get(function () {
  return this.exoneree && !this.approuveeParAdmin && this.statut === 'active';
});

// ========================================
// MÉTHODES D'INSTANCE
// ========================================

/**
 * Demander une exonération
 */
PenaliteSchema.methods.demanderExoneration = function (userId, raison) {
  if (this.statut !== 'active') {
    throw new Error('Seule une pénalité active peut être exonérée');
  }

  if (!raison || raison.trim().length < 10) {
    throw new Error('La raison doit contenir au moins 10 caractères');
  }

  this.exoneree = true;
  this.raisonExoneration = raison;
  this.demandeExonerationPar = userId;
  this.dateDemandeExoneration = Date.now();
};

/**
 * Approuver l'exonération (Admin)
 */
PenaliteSchema.methods.approuverExoneration = function (adminId, commentaire = null) {
  if (!this.exoneree) {
    throw new Error('Aucune demande d\'exonération en cours');
  }

  if (this.approuveeParAdmin) {
    throw new Error('Exonération déjà approuvée');
  }

  this.approuveeParAdmin = true;
  this.approuveePar = adminId;
  this.dateApprobation = Date.now();
  this.commentaireApprobation = commentaire;
  this.statut = 'exoneree';
  this.dateExoneration = Date.now();
};

/**
 * Rejeter l'exonération (Admin)
 */
PenaliteSchema.methods.rejeterExoneration = function (adminId, commentaire) {
  if (!this.exoneree) {
    throw new Error('Aucune demande d\'exonération en cours');
  }

  if (this.approuveeParAdmin) {
    throw new Error('Exonération déjà approuvée');
  }

  if (!commentaire) {
    throw new Error('Le commentaire de rejet est requis');
  }

  // Réinitialiser les champs d'exonération
  this.exoneree = false;
  this.raisonExoneration = null;
  this.demandeExonerationPar = null;
  this.dateDemandeExoneration = null;
  this.approuveePar = adminId;
  this.dateApprobation = Date.now();
  this.commentaireApprobation = commentaire;
};

/**
 * Marquer comme payée
 */
PenaliteSchema.methods.marquerPayee = function (transactionId) {
  if (this.statut !== 'active') {
    throw new Error('Seule une pénalité active peut être payée');
  }

  this.statut = 'payee';
  this.datePaiement = Date.now();
  this.payeAvecTransaction = transactionId;
};

/**
 * Annuler la pénalité
 */
PenaliteSchema.methods.annuler = function (raison) {
  if (this.statut === 'payee') {
    throw new Error('Une pénalité payée ne peut pas être annulée');
  }

  this.statut = 'annulee';
  this.notes = raison;
};

// ========================================
// MÉTHODES STATIQUES
// ========================================

/**
 * Calculer une pénalité
 */
PenaliteSchema.statics.calculerPenalite = async function (params) {
  const {
    userId,
    tontineId,
    transactionId,
    montantCotisation,
    dateEcheance,
    dateActuelle = new Date(),
  } = params;

  // Récupérer les paramètres de la tontine
  const Tontine = mongoose.model('Tontine');
  const tontine = await Tontine.findById(tontineId);

  if (!tontine) {
    throw new Error('Tontine non trouvée');
  }

  // Calculer jours de retard
  const diffTime = dateActuelle - new Date(dateEcheance);
  const joursRetard = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // Appliquer délai de grâce
  const joursRetardEffectifs = Math.max(0, joursRetard - tontine.delaiGrace);

  if (joursRetardEffectifs <= 0) {
    return null; // Pas de pénalité
  }

  // Calculer pénalité (taux par semaine)
  const semainesRetard = Math.ceil(joursRetardEffectifs / 7);
  const montantPenalite = Math.floor(
    (montantCotisation * tontine.tauxPenalite * semainesRetard) / 100
  );

  // Créer la pénalité
  const penalite = await this.create({
    userId,
    tontineId,
    transactionId,
    montantPenalite,
    montantCotisation,
    tauxApplique: tontine.tauxPenalite,
    joursRetard: joursRetardEffectifs,
    dateEcheance,
    dateCalcul: dateActuelle,
    calculeeAutomatiquement: true,
  });

  return penalite;
};

/**
 * Obtenir les pénalités actives d'un membre
 */
PenaliteSchema.statics.getPenalitesActives = function (userId, tontineId = null) {
  const query = { userId, statut: 'active' };
  if (tontineId) query.tontineId = tontineId;

  return this.find(query)
    .populate('tontineId', 'nom')
    .sort({ dateCalcul: -1 });
};

/**
 * Obtenir les demandes d'exonération en attente
 */
PenaliteSchema.statics.getDemandesExonerationEnAttente = function () {
  return this.find({
    exoneree: true,
    approuveeParAdmin: false,
    statut: 'active',
  })
    .populate('userId', 'prenom nom email')
    .populate('tontineId', 'nom')
    .populate('demandeExonerationPar', 'prenom nom')
    .sort({ dateDemandeExoneration: -1 });
};

/**
 * Obtenir le total des pénalités par membre
 */
PenaliteSchema.statics.getTotalPenalitesMembre = async function (userId, tontineId = null) {
  const match = { userId, statut: 'active' };
  if (tontineId) match.tontineId = tontineId;

  const result = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: '$montantPenalite' },
        count: { $sum: 1 },
      },
    },
  ]);

  return result.length > 0 ? result[0] : { total: 0, count: 0 };
};

/**
 * Statistiques globales des pénalités
 */
PenaliteSchema.statics.getStats = async function (filters = {}) {
  const stats = await this.aggregate([
    { $match: filters },
    {
      $group: {
        _id: '$statut',
        count: { $sum: 1 },
        totalMontant: { $sum: '$montantPenalite' },
      },
    },
  ]);

  return stats;
};

/**
 * Calculer les pénalités pour toutes les transactions en retard
 */
PenaliteSchema.statics.calculerPenalitesEnRetard = async function () {
  const Transaction = mongoose.model('Transaction');

  // Trouver toutes les transactions validées en retard sans pénalité
  const transactionsEnRetard = await Transaction.find({
    statut: 'Validée',
    joursRetard: { $gt: 0 },
  });

  const penalitesCreees = [];

  for (const transaction of transactionsEnRetard) {
    // Vérifier si pénalité déjà existante
    const penaliteExistante = await this.findOne({
      transactionId: transaction._id,
    });

    if (!penaliteExistante) {
      const penalite = await this.calculerPenalite({
        userId: transaction.userId,
        tontineId: transaction.tontineId,
        transactionId: transaction._id,
        montantCotisation: transaction.montantCotisation || transaction.montant,
        dateEcheance: transaction.dateEcheance,
        dateActuelle: transaction.dateTransaction,
      });

      if (penalite) {
        penalitesCreees.push(penalite);
      }
    }
  }

  return penalitesCreees;
};


module.exports = mongoose.model('Penalite', PenaliteSchema);