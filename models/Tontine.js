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
 // Ajoute ce champ après "description"
reglement: {
  type: String,
  trim: true,
  maxlength: [2000, 'Le règlement ne peut pas dépasser 2000 caractères'],
  description: 'Règlement automatique généré + règles complémentaires'
},

description: {
  type: String,
  trim: true,
  maxlength: [1000, 'La description ne peut pas dépasser 1000 caractères'], // Augmenté à 1000
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
  validator: (value) => value > 0,  //  CHANGÉ : > 0 au lieu de >= 0
  message: 'Le montant doit être supérieur à 0',
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
 membres: [{
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dateAjout: { type: Date, default: Date.now },
  aGagne: { type: Boolean, default: false },
  dateGain: Date,
  montantGagne: Number,
  
  //  NOUVEAUX CHAMPS OPT-IN
  participeTirage: {
    type: Boolean,
    default: false,  //  CHANGÉ : false par défaut
    description: 'Le membre souhaite participer au prochain tirage'
  },
  dateOptIn: {
    type: Date,
    description: 'Date de dernière confirmation de participation'
  },
  dateNotificationTirage: {  //  NOUVEAU
    type: Date,
    description: 'Date de notification du prochain tirage'
  },
  optInAutomatique: {  //  NOUVEAU
    type: Boolean,
    default: false,
    description: 'Participation confirmée automatiquement après délai'
  }
}],
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
  default: 1,  //  CHANGÉ : 1 au lieu de 3
  min: [1, 'Minimum 1 membre supplémentaire requis'],  //  CHANGÉ
},
    
  nombreMembresMax: {
  type: Number,
  default: 50,
  min: [1, 'Maximum doit être au moins 1'],  //  CHANGÉ : 1 au lieu de 2
  validate: {
    validator: function (value) {
      return value >= this.nombreMembresMin;
    },
    message: 'Le maximum doit être supérieur ou égal au minimum',
  },
},
delaiOptIn: {
  type: Number,
  default: 15,  //  15 minutes par défaut
  min: [5, 'Délai minimum 5 minutes'],
  max: [1440, 'Délai maximum 24 heures'],
  description: "Délai (en minutes) avant opt-in automatique"
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
// (avec protection undefined)
TontineSchema.virtual('nombreMembres').get(function () {
  return this.membres?.length || 0;
});

TontineSchema.virtual('nombreMembresActifs').get(function () {
  return this.membres?.filter((m) => !m.aGagne).length || 0;
});

TontineSchema.virtual('estComplet').get(function () {
  return (this.membres?.length || 0) >= this.nombreMembresMax;
});

TontineSchema.virtual('peutEtreActive').get(function () {
  return (
    this.statut === TONTINE_STATUS.EN_ATTENTE &&
    (this.membres?.length || 0) >= this.nombreMembresMin
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

  while (dateEcheance <= dateLimite) {
    calendrier.push({
      numeroEcheance,
      dateEcheance: new Date(dateEcheance),
      montant: this.montantCotisation,
      statut: 'en_attente',
    });

    //  CORRECTION : Utiliser setMonth pour mensuel, setDate pour hebdo
    if (this.frequence === FREQUENCES.HEBDOMADAIRE) {
      dateEcheance.setDate(dateEcheance.getDate() + 7);
    } else {
      dateEcheance.setMonth(dateEcheance.getMonth() + 1);  // Vrai mois (28-31 jours)
    }
    
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

  //  Vérification trésorier obligatoire
  if (!this.tresorierAssigne) {
    throw new Error('Un trésorier doit être assigné avant l\'activation');
  }
  
  //  Calculer minimum dynamiquement : Admin + Trésorier + nombreMembresMin
  const minAttendu = 2 + this.nombreMembresMin;  // 2 = Admin + Trésorier
  
  if (this.membres.length < minAttendu) {
    throw new Error(
      `Au moins ${minAttendu} membres requis : ` +
      `Admin + Trésorier + ${this.nombreMembresMin} membre(s) supplémentaire(s). ` +
      `Actuellement : ${this.membres.length} membre(s) dans la tontine`
    );
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
 * Générer le règlement automatique de la tontine
 */
TontineSchema.methods.genererReglement = function () {
  const frequenceText = this.frequence === 'hebdomadaire' ? 'semaine' : 'mois';
  const montantText = this.montantCotisation.toLocaleString('fr-FR');
  
  return ` RÈGLEMENT DE LA TONTINE "${this.nom.toUpperCase()}"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 FRÉQUENCE : ${frequenceText}
 COTISATION : ${montantText} FCFA par ${frequenceText}
 MEMBRES : Minimum ${this.nombreMembresMin} - Maximum ${this.nombreMembresMax}
 DURÉE : Du ${new Date(this.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(this.dateFin).toLocaleDateString('fr-FR')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 PÉNALITÉS (NON MODIFIABLE)
Ces paramètres sont fixés et ne peuvent être modifiés :

- Taux de pénalité : ${this.tauxPenalite}% du montant dû
- Délai de grâce : ${this.delaiGrace} jour(s) après échéance
- Application automatique après le délai de grâce

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 RÈGLES GÉNÉRALES

1. COTISATION
   • Chaque membre cotise ${montantText} FCFA par ${frequenceText}
   • Le paiement doit être effectué avant la date d'échéance
   • Retards sanctionnés selon les pénalités ci-dessus

2. TIRAGE AU SORT
   • Le tirage détermine l'ordre de réception de la cagnotte
   • Chaque membre reçoit la totalité de la cagnotte une seule fois
   • Les membres doivent confirmer leur participation avant chaque tirage

3. DISTRIBUTION
   • Le montant distribué = Total des cotisations collectées
   • Le bénéficiaire est notifié immédiatement après le tirage
   • Le paiement est effectué par le trésorier

4. ENGAGEMENT
   • En acceptant cette invitation, vous vous engagez à respecter ce règlement
   • Le non-respect peut entraîner votre exclusion de la tontine

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 RÈGLES COMPLÉMENTAIRES (Modifiables par l'administrateur)

`;
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