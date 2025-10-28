// models/Tontine.js
const mongoose = require('mongoose');
const { TONTINE_STATUS, FREQUENCES } = require('../config/constants');

const TontineSchema = new mongoose.Schema(
  {
    // Informations générales
    nom: {
      type: String,
      required: [true, 'Le nom de la tontine est requis'],
      trim: true,
      minlength: [3, 'Le nom doit contenir au moins 3 caractères'],
      maxlength: [100, 'Le nom ne peut pas dépasser 100 caractères'],
      unique: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'La description ne peut pas dépasser 500 caractères'],
    },

 montantCotisation: {
  type: Number,
  required: [true, 'Le montant de cotisation est requis'],
  // min: [0, 'Le montant doit être positif ou zéro']  → supprimé pour autoriser 0
  validate: [
    {
      validator: Number.isInteger,
      message: 'Le montant doit être un nombre entier',
    },
    {
      validator: (value) => value >= 0,
      message: 'Le montant ne peut pas être négatif',
    },
  ],
},
    frequence: {
      type: String,
      enum: {
        values: [FREQUENCES.HEBDOMADAIRE, FREQUENCES.MENSUELLE],
        message: 'Fréquence invalide',
      },
      required: [true, 'La fréquence est requise'],
    },

    // Dates
    dateDebut: {
      type: Date,
      required: [true, 'La date de début est requise'],
    },
    dateFin: {
      type: Date,
      required: [true, 'La date de fin est requise'],
      validate: {
        validator: function (value) {
          return value > this.dateDebut;
        },
        message: 'La date de fin doit être après la date de début',
      },
    },
    dateActivation: Date,
    dateCloture: Date,

    // Membres
   membres: [
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    dateAjout: {
      type: Date,
      default: Date.now,
    },
    aGagne: {
      type: Boolean,
      default: false,
    },
    dateGain: Date,
    montantGagne: Number,
    
    // NOUVEAUX CHAMPS POUR OPT-IN TIRAGE
    participeTirage: {
      type: Boolean,
      default: true,
      description: 'Le membre souhaite participer au prochain tirage'
    },
    dateOptIn: {
      type: Date,
      description: 'Date de dernière confirmation de participation'
    },
  },
],
    // Trésorier assigné à cette tontine (OBLIGATOIRE pour activation)
// Tontine.js - CORRECTION
tresorierAssigne: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'User',
  validate: {
    validator: async function(userId) {
      if (!userId) return true;
      const User = mongoose.model('User');
      const user = await User.findById(userId);
      return user && user.role === 'tresorier' && user.isActive; // ✅ MINUSCULE
    },
    message: 'Le trésorier assigné doit être un Trésorier actif'
  }
},
    nombreMembresMin: {
      type: Number,
      default: 3,
      min: [2, 'Minimum 2 membres requis'],
    },
    
    nombreMembresMax: {
      type: Number,
      default: 50,
      min: [2, 'Maximum doit être au moins 2'],
      validate: {
        validator: function (value) {
          return value >= this.nombreMembresMin;
        },
        message: 'Le maximum doit être supérieur ou égal au minimum',
      },
    },

    // Statut
    statut: {
      type: String,
      enum: {
        values: Object.values(TONTINE_STATUS),
        message: 'Statut invalide',
      },
      default: TONTINE_STATUS.EN_ATTENTE,
    },

    // Pénalités
    tauxPenalite: {
      type: Number,
      default: parseInt(process.env.DEFAULT_PENALTY_RATE) || 5,
      min: [0, 'Le taux de pénalité ne peut pas être négatif'],
      max: [50, 'Le taux de pénalité ne peut pas dépasser 50%'],
    },
    delaiGrace: {
      type: Number,
      default: parseInt(process.env.DEFAULT_GRACE_PERIOD_DAYS) || 2,
      min: [0, 'Le délai de grâce ne peut pas être négatif'],
      max: [30, 'Le délai de grâce ne peut pas dépasser 30 jours'],
    },

    // Calendrier des cotisations (généré automatiquement à l'activation)
    calendrierCotisations: [
      {
        numeroEcheance: Number,
        dateEcheance: Date,
        montant: Number,
        statut: {
          type: String,
          enum: ['en_attente', 'en_cours', 'cloturee'],
          default: 'en_attente',
        },
      },
    ],

    // Statistiques
    stats: {
      montantTotalCollecte: { type: Number, default: 0 },
      montantTotalDistribue: { type: Number, default: 0 },
      nombreCotisationsValidees: { type: Number, default: 0 },
      nombreCotisationsEnRetard: { type: Number, default: 0 },
      tauxParticipation: { type: Number, default: 0 }, // En %
    },

    // Métadonnées
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Historique des modifications
    historiqueModifications: [
      {
        date: { type: Date, default: Date.now },
        modifiePar: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        champModifie: String,
        ancienneValeur: mongoose.Schema.Types.Mixed,
        nouvelleValeur: mongoose.Schema.Types.Mixed,
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ========================================
// INDEXES
// ========================================
TontineSchema.index({ nom: 1 });
TontineSchema.index({ statut: 1 });
TontineSchema.index({ dateDebut: 1 });
TontineSchema.index({ 'membres.userId': 1 });

// ========================================
// VIRTUALS
// ========================================
TontineSchema.virtual('nombreMembres').get(function () {
  return this.membres.length;
});

TontineSchema.virtual('nombreMembresActifs').get(function () {
  return this.membres.filter((m) => !m.aGagne).length;
});

TontineSchema.virtual('estComplet').get(function () {
  return this.membres.length >= this.nombreMembresMax;
});

TontineSchema.virtual('peutEtreActive').get(function () {
  return (
    this.statut === TONTINE_STATUS.EN_ATTENTE &&
    this.membres.length >= this.nombreMembresMin
  );
});

TontineSchema.virtual('duree').get(function () {
  if (!this.dateDebut || !this.dateFin) return 0;
  const diff = this.dateFin - this.dateDebut;
  return Math.ceil(diff / (1000 * 60 * 60 * 24)); // En jours
});

// ========================================
// MÉTHODES D'INSTANCE
// ========================================

/**
 * Ajouter un membre
 */
TontineSchema.methods.ajouterMembre = function (userId) {
  // Vérifier si déjà membre
  const existe = this.membres.some((m) => m.userId.toString() === userId.toString());
  if (existe) {
    throw new Error('Ce membre est déjà dans la tontine');
  }

  // Vérifier capacité
  if (this.membres.length >= this.nombreMembresMax) {
    throw new Error('La tontine a atteint sa capacité maximale');
  }

  // Vérifier statut
  if (this.statut !== TONTINE_STATUS.EN_ATTENTE) {
    throw new Error('Impossible d\'ajouter un membre après activation');
  }

  this.membres.push({
    userId,
    dateAjout: Date.now(),
  });
};

/**
 * Retirer un membre
 */
TontineSchema.methods.retirerMembre = function (userId) {
  // Possible uniquement avant activation
  if (this.statut !== TONTINE_STATUS.EN_ATTENTE) {
    throw new Error('Impossible de retirer un membre après activation');
  }

  this.membres = this.membres.filter(
    (m) => m.userId.toString() !== userId.toString()
  );
};

/**
 * Générer le calendrier des cotisations
 */
TontineSchema.methods.genererCalendrierCotisations = function () {
  if (this.statut !== TONTINE_STATUS.EN_ATTENTE) {
    throw new Error('Le calendrier a déjà été généré');
  }

  const calendrier = [];
  let dateEcheance = new Date(this.dateDebut);
  const dateLimite = new Date(this.dateFin);
  let numeroEcheance = 1;

  // Incrément selon fréquence
  const increment =
    this.frequence === FREQUENCES.HEBDOMADAIRE
      ? 7 // 7 jours
      : 30; // ~1 mois

  while (dateEcheance <= dateLimite) {
    calendrier.push({
      numeroEcheance,
      dateEcheance: new Date(dateEcheance),
      montant: this.montantCotisation,
      statut: 'en_attente',
    });

    // Prochaine échéance
    dateEcheance.setDate(dateEcheance.getDate() + increment);
    numeroEcheance++;
  }

  this.calendrierCotisations = calendrier;
  return calendrier;
};

/**
 * Activer la tontine
 */
TontineSchema.methods.activer = function () {
  if (this.statut !== TONTINE_STATUS.EN_ATTENTE) {
    throw new Error('La tontine n\'est pas en attente');
  }

  if (this.membres.length < this.nombreMembresMin) {
    throw new Error(
      `Minimum ${this.nombreMembresMin} membres requis (actuellement ${this.membres.length})`
    );
  }
  
  // NOUVELLE VERIFICATION : Trésorier obligatoire
  if (!this.tresorierAssigne) {
    throw new Error('Un trésorier doit être assigné avant l\'activation de la tontine');
  }

  // Générer le calendrier si pas déjà fait
  if (this.calendrierCotisations.length === 0) {
    this.genererCalendrierCotisations();
  }

  this.statut = TONTINE_STATUS.ACTIVE;
  this.dateActivation = Date.now();
};
/**
 * Bloquer la tontine
 */
TontineSchema.methods.bloquer = function () {
  if (this.statut !== TONTINE_STATUS.ACTIVE) {
    throw new Error('Seule une tontine active peut être bloquée');
  }

  this.statut = TONTINE_STATUS.BLOQUEE;
};

/**
 * Débloquer/Réactiver la tontine
 */
TontineSchema.methods.reactiver = function () {
  if (this.statut !== TONTINE_STATUS.BLOQUEE) {
    throw new Error('Seule une tontine bloquée peut être réactivée');
  }

  this.statut = TONTINE_STATUS.ACTIVE;
};

/**
 * Clôturer la tontine
 */
TontineSchema.methods.cloturer = function () {
  // Vérifier que tous les membres ont gagné
  const membresNonGagnants = this.membres.filter((m) => !m.aGagne);
  if (membresNonGagnants.length > 0) {
    throw new Error('Tous les membres doivent avoir gagné avant clôture');
  }

  this.statut = TONTINE_STATUS.TERMINEE;
  this.dateCloture = Date.now();
};

/**
 * Mettre à jour les statistiques
 */
TontineSchema.methods.updateStats = async function () {
  const Transaction = mongoose.model('Transaction');

  const stats = await Transaction.aggregate([
    {
      $match: {
        tontineId: this._id,
        statut: 'Validée',
      },
    },
    {
      $group: {
        _id: null,
        totalCollecte: { $sum: '$montant' },
        nombreValidees: { $sum: 1 },
      },
    },
  ]);

  if (stats.length > 0) {
    this.stats.montantTotalCollecte = stats[0].totalCollecte;
    this.stats.nombreCotisationsValidees = stats[0].nombreValidees;
  }

  // Calculer taux de participation
  const totalAttendu =
    this.calendrierCotisations.length * this.membres.length * this.montantCotisation;
  this.stats.tauxParticipation =
    totalAttendu > 0 ? (this.stats.montantTotalCollecte / totalAttendu) * 100 : 0;
};

// ========================================
// MÉTHODES STATIQUES
// ========================================

/**
 * Obtenir statistiques globales
 */
TontineSchema.statics.getGlobalStats = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$statut',
        count: { $sum: 1 },
        totalMembres: { $sum: { $size: '$membres' } },
      },
    },
  ]);

  return stats;
};


module.exports = mongoose.model('Tontine', TontineSchema);