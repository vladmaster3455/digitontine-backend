// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES } = require('../config/constants');

const UserSchema = new mongoose.Schema(
  {
    // Informations personnelles
    prenom: {
      type: String,
      required: [true, 'Le prénom est requis'],
      trim: true,
      minlength: [2, 'Le prénom doit contenir au moins 2 caractères'],
      maxlength: [50, 'Le prénom ne peut pas dépasser 50 caractères'],
    },
    nom: {
      type: String,
      required: [true, 'Le nom est requis'],
      trim: true,
      minlength: [2, 'Le nom doit contenir au moins 2 caractères'],
      maxlength: [50, 'Le nom ne peut pas dépasser 50 caractères'],
    },
    email: {
      type: String,
      required: [true, 'L\'email est requis'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Format d\'email invalide',
      ],
      index: true,
    },
    numeroTelephone: {
      type: String,
      required: [true, 'Le numéro de téléphone est requis'],
      unique: true,
      trim: true,
      match: [
        /^\+221[7][0-9]{8}$/,
        'Format de téléphone invalide (ex: +221771234567)',
      ],
      index: true,
    },
    adresse: {
      type: String,
      trim: true,
      maxlength: [200, 'L\'adresse ne peut pas dépasser 200 caractères'],
    },
    carteIdentite: {
      type: String,
      required: [true, 'La carte d\'identité est requise'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    dateNaissance: {
      type: Date,
      required: [true, 'La date de naissance est requise'],
      validate: {
        validator: function (value) {
          // Minimum 18 ans
          const age = Math.floor((Date.now() - value) / (365.25 * 24 * 60 * 60 * 1000));
          return age >= 18;
        },
        message: 'L\'utilisateur doit avoir au moins 18 ans',
      },
    },

    //  PHOTOS
    photoIdentite: {
      url: {
        type: String,
        required: [true, 'La photo d\'identité est requise'],
      },
      publicId: {
        type: String,
        required: true,
      },
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
      //  NON MODIFIABLE après création
      isLocked: {
        type: Boolean,
        default: true,
      },
    },
    photoProfil: {
      url: String,
      publicId: String,
      uploadedAt: Date,
    },

    // Authentification
    motDePasse: {
      type: String,
      required: [true, 'Le mot de passe est requis'],
      minlength: [8, 'Le mot de passe doit contenir au moins 8 caractères'],
      select: false,
    },
    isFirstLogin: {
      type: Boolean,
      default: true,
    },
    lastPasswordChange: {
      type: Date,
      default: Date.now,
    },

    // Rôle et statut
    role: {
      type: String,
      enum: {
        values: [ROLES.ADMIN, ROLES.TRESORIER, ROLES.MEMBRE],
        message: 'Rôle invalide',
      },
      required: [true, 'Le rôle est requis'],
      default: ROLES.MEMBRE,
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    // Tokens et sécurité
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    fcmTokens: [
      {
        token: String,
        device: String,
        lastUsed: Date,
      },
    ],

    // Historique connexions
    loginHistory: [
      {
        date: { type: Date, default: Date.now },
        ip: String,
        userAgent: String,
        success: Boolean,
      },
    ],

    // Préférences
    preferences: {
      receiveEmailNotifications: { type: Boolean, default: true },
      receivePushNotifications: { type: Boolean, default: true },
      receiveSMS: { type: Boolean, default: false },
      language: { type: String, default: 'fr' },
    },

    // Métadonnées
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
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
UserSchema.index({ email: 1 });
UserSchema.index({ numeroTelephone: 1 });
UserSchema.index({ carteIdentite: 1 });
UserSchema.index({ role: 1, isActive: 1 });

// ========================================
// VIRTUALS
// ========================================
UserSchema.virtual('nomComplet').get(function () {
  return `${this.prenom} ${this.nom}`;
});

UserSchema.virtual('age').get(function () {
  if (!this.dateNaissance) return null;
  const age = Math.floor((Date.now() - this.dateNaissance) / (365.25 * 24 * 60 * 60 * 1000));
  return age;
});

// ========================================
// HOOKS (MIDDLEWARE)
// ========================================

// Hash password avant sauvegarde
UserSchema.pre('save', async function (next) {
  if (!this.isModified('motDePasse')) return next();

  try {
    const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS) || 10);
    this.motDePasse = await bcrypt.hash(this.motDePasse, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Mettre à jour lastModifiedBy
UserSchema.pre('save', function (next) {
  if (this.isModified() && !this.isNew) {
    this.lastModifiedBy = this._updateUserId;
  }
  next();
});

//  Verrouiller la photo d'identité après création
UserSchema.pre('save', function (next) {
  if (this.isNew && this.photoIdentite) {
    this.photoIdentite.isLocked = true;
  }
  next();
});

// ========================================
// MÉTHODES D'INSTANCE
// ========================================

UserSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.motDePasse);
};

UserSchema.methods.generatePasswordResetToken = function () {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const crypto = require('crypto');
  this.resetPasswordToken = crypto.createHash('sha256').update(code).digest('hex');
  this.resetPasswordExpire = Date.now() + 15 * 60 * 1000;
  return code;
};

UserSchema.methods.addFCMToken = function (token, device) {
  this.fcmTokens = this.fcmTokens.filter((t) => t.token !== token);
  this.fcmTokens.push({
    token,
    device,
    lastUsed: Date.now(),
  });
  if (this.fcmTokens.length > 5) {
    this.fcmTokens = this.fcmTokens.slice(-5);
  }
};

UserSchema.methods.removeFCMToken = function (token) {
  this.fcmTokens = this.fcmTokens.filter((t) => t.token !== token);
};

UserSchema.methods.logLogin = function (ip, userAgent, success) {
  this.loginHistory.push({
    date: Date.now(),
    ip,
    userAgent,
    success,
  });
  if (this.loginHistory.length > 50) {
    this.loginHistory = this.loginHistory.slice(-50);
  }
};

//  Mettre à jour la photo de profil (modifiable)
UserSchema.methods.updateProfilePhoto = function (url, publicId) {
  this.photoProfil = {
    url,
    publicId,
    uploadedAt: Date.now(),
  };
};

// ========================================
// MÉTHODES STATIQUES
// ========================================

UserSchema.statics.findByEmailOrPhone = function (identifier) {
  const isEmail = identifier.includes('@');
  const query = isEmail ? { email: identifier.toLowerCase() } : { numeroTelephone: identifier };
  return this.findOne(query).select('+motDePasse');
};

UserSchema.statics.emailExists = async function (email, excludeId = null) {
  const query = { email: email.toLowerCase() };
  if (excludeId) query._id = { $ne: excludeId };
  const count = await this.countDocuments(query);
  return count > 0;
};

UserSchema.statics.phoneExists = async function (phone, excludeId = null) {
  const query = { numeroTelephone: phone };
  if (excludeId) query._id = { $ne: excludeId };
  const count = await this.countDocuments(query);
  return count > 0;
};

UserSchema.statics.carteIdentiteExists = async function (carteId, excludeId = null) {
  const query = { carteIdentite: carteId.toUpperCase() };
  if (excludeId) query._id = { $ne: excludeId };
  const count = await this.countDocuments(query);
  return count > 0;
};

UserSchema.statics.getStats = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$role',
        count: { $sum: 1 },
        active: {
          $sum: { $cond: ['$isActive', 1, 0] },
        },
      },
    },
  ]);
  return stats;
};

module.exports = mongoose.model('User', UserSchema);