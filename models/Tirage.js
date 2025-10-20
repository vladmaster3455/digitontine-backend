// models/Tirage.js
const mongoose = require('mongoose');

const TirageSchema = new mongoose.Schema(
  {
    // Relations
    tontineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tontine',
      required: [true, 'La tontine est requise'],
      index: true,
    },
    beneficiaireId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Le bénéficiaire est requis'],
      index: true,
    },

    // Informations du tirage
    numeroTirage: {
      type: Number,
      required: [true, 'Le numéro de tirage est requis'],
      min: [1, 'Le numéro doit être positif'],
    },
    dateTirage: {
      type: Date,
      default: Date.now,
      index: true,
    },
    montantDistribue: {
      type: Number,
      required: [true, 'Le montant est requis'],
      min: [0, 'Le montant doit être positif'],
    },

    // Méthode de sélection
    methodeTirage: {
      type: String,
      enum: ['aleatoire', 'tour_de_role', 'manuel'],
      default: 'aleatoire',
    },

    // Algorithme de sélection (pour traçabilité)
    detailsAlgorithme: {
      candidatsEligibles: [
        {
          userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
          },
          nom: String,
          cotisationsAJour: Boolean,
          score: Number, // Score de priorité si applicable
        },
      ],
      seed: String, // Seed aléatoire pour reproductibilité
      resultatAleatoire: Number,
    },

    // Statut du paiement
    statutPaiement: {
      type: String,
      enum: ['en_attente', 'paye', 'echec'],
      default: 'en_attente',
    },
    datePaiement: Date,
    referencePaiement: String,
    moyenPaiement: {
      type: String,
      enum: ['Wave', 'Orange Money', 'Virement', 'Cash'],
    },

    // Notifications
    notificationEnvoyee: {
      type: Boolean,
      default: false,
    },
    dateNotification: Date,

    // Validation
    valideParTresorier: {
      type: Boolean,
      default: false,
    },
    dateValidation: Date,
    validePar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Commentaires/Notes
    notes: String,

    // Métadonnées
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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
TirageSchema.index({ tontineId: 1, numeroTirage: 1 }, { unique: true });
TirageSchema.index({ tontineId: 1, beneficiaireId: 1 });
TirageSchema.index({ dateTirage: -1 });

// ========================================
// VIRTUALS
// ========================================
TirageSchema.virtual('estPaye').get(function () {
  return this.statutPaiement === 'paye';
});

TirageSchema.virtual('estEnAttente').get(function () {
  return this.statutPaiement === 'en_attente';
});

// ========================================
// MÉTHODES D'INSTANCE
// ========================================

/**
 * Marquer le tirage comme payé
 */
TirageSchema.methods.marquerPaye = function (moyenPaiement, referencePaiement) {
  this.statutPaiement = 'paye';
  this.datePaiement = Date.now();
  this.moyenPaiement = moyenPaiement;
  this.referencePaiement = referencePaiement;
};

/**
 * Valider le tirage (par trésorier)
 */
TirageSchema.methods.valider = function (tresorier) {
  this.valideParTresorier = true;
  this.dateValidation = Date.now();
  this.validePar = tresorier._id;
};

/**
 * Marquer la notification comme envoyée
 */
TirageSchema.methods.marquerNotificationEnvoyee = function () {
  this.notificationEnvoyee = true;
  this.dateNotification = Date.now();
};

/**
 * Mettre à jour le statut du membre dans la tontine
 */
TirageSchema.methods.updateMembreTontine = async function () {
  const Tontine = mongoose.model('Tontine');
  const tontine = await Tontine.findById(this.tontineId);

  if (!tontine) {
    throw new Error('Tontine non trouvée');
  }

  // Trouver le membre et marquer comme ayant gagné
  const membre = tontine.membres.find(
    (m) => m.userId.toString() === this.beneficiaireId.toString()
  );

  if (membre) {
    membre.aGagne = true;
    membre.dateGain = this.dateTirage;
    membre.montantGagne = this.montantDistribue;
    await tontine.save();
  }
};

// ========================================
// MÉTHODES STATIQUES
// ========================================

/**
 * Vérifier si un membre a déjà gagné dans une tontine
 */
TirageSchema.statics.membreADejaGagne = async function (tontineId, userId) {
  const count = await this.countDocuments({
    tontineId,
    beneficiaireId: userId,
  });

  return count > 0;
};

/**
 * Obtenir le prochain numéro de tirage
 */
TirageSchema.statics.getProchainNumero = async function (tontineId) {
  const dernierTirage = await this.findOne({ tontineId })
    .sort({ numeroTirage: -1 })
    .select('numeroTirage');

  return dernierTirage ? dernierTirage.numeroTirage + 1 : 1;
};

/**
 * Obtenir tous les tirages d'une tontine
 */
TirageSchema.statics.getByTontine = function (tontineId) {
  return this.find({ tontineId })
    .populate('beneficiaireId', 'prenom nom email numeroTelephone')
    .populate('createdBy', 'prenom nom')
    .sort({ numeroTirage: -1 });
};

/**
 * Obtenir les membres éligibles pour un tirage
 */
TirageSchema.statics.getMembresEligibles = async function (tontineId) {
  const Tontine = mongoose.model('Tontine');
  const Transaction = mongoose.model('Transaction');

  // Récupérer la tontine
  const tontine = await Tontine.findById(tontineId).populate('membres.userId');

  if (!tontine) {
    throw new Error('Tontine non trouvée');
  }

  // Obtenir les membres qui n'ont pas encore gagné
  const membresNonGagnants = tontine.membres.filter((m) => !m.aGagne);

  // Vérifier les cotisations à jour pour chaque membre
  const eligibles = [];

  for (const membre of membresNonGagnants) {
    // Vérifier si cotisations à jour
    const transactionsEnRetard = await Transaction.countDocuments({
      tontineId,
      userId: membre.userId._id,
      statut: 'En attente',
      dateEcheance: { $lt: new Date() },
    });

    eligibles.push({
      userId: membre.userId._id,
      nom: `${membre.userId.prenom} ${membre.userId.nom}`,
      cotisationsAJour: transactionsEnRetard === 0,
    });
  }

  return eligibles;
};

/**
 * Effectuer un tirage aléatoire
 */
TirageSchema.statics.effectuerTirageAleatoire = async function (
  tontineId,
  montant,
  createdBy
) {
  // Obtenir les membres éligibles
  const eligibles = await this.getMembresEligibles(tontineId);

  if (eligibles.length === 0) {
    throw new Error('Aucun membre éligible pour le tirage');
  }

  // Filtrer uniquement ceux à jour (optionnel - selon règles métier)
  const eligiblesAJour = eligibles.filter((e) => e.cotisationsAJour);

  const candidats = eligiblesAJour.length > 0 ? eligiblesAJour : eligibles;

  // Tirage aléatoire
  const seed = Date.now().toString();
  const randomValue = Math.random();
  const indexGagnant = Math.floor(randomValue * candidats.length);
  const gagnant = candidats[indexGagnant];

  // Obtenir le prochain numéro
  const numeroTirage = await this.getProchainNumero(tontineId);

  // Créer le tirage
  const tirage = await this.create({
    tontineId,
    beneficiaireId: gagnant.userId,
    numeroTirage,
    montantDistribue: montant,
    methodeTirage: 'aleatoire',
    detailsAlgorithme: {
      candidatsEligibles: candidats.map((c, idx) => ({
        ...c,
        score: idx,
      })),
      seed,
      resultatAleatoire: randomValue,
    },
    createdBy,
  });

  // Mettre à jour le membre dans la tontine
  await tirage.updateMembreTontine();

  return tirage;
};

/**
 * Statistiques des tirages
 */
TirageSchema.statics.getStats = async function (tontineId) {
  const stats = await this.aggregate([
    { $match: { tontineId: mongoose.Types.ObjectId(tontineId) } },
    {
      $group: {
        _id: null,
        totalTirages: { $sum: 1 },
        totalDistribue: { $sum: '$montantDistribue' },
        tiragePaye: {
          $sum: { $cond: [{ $eq: ['$statutPaiement', 'paye'] }, 1, 0] },
        },
      },
    },
  ]);

  return stats.length > 0 ? stats[0] : null;
};


module.exports = mongoose.model('Tirage', TirageSchema);