// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES, ROLE_VALUES } = require('../config/constants'); // ✅ CHANGE: Ajoute ROLE_VALUES

const UserSchema = new mongoose.Schema(
  {
    // Informations personnelles
    prenom: {
      type: String,
      required: [true, 'Le prenom est requis'],
      trim: true,
      minlength: [2, 'Le prenom doit contenir au moins 2 caracteres'],
      maxlength: [50, 'Le prenom ne peut pas depasser 50 caracteres'],
    },
    nom: {
      type: String,
      required: [true, 'Le nom est requis'],
      trim: true,
      minlength: [2, 'Le nom doit contenir au moins 2 caracteres'],
      maxlength: [50, 'Le nom ne peut pas depasser 50 caracteres'],
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
    },
    numeroTelephone: {
      type: String,
      required: [true, 'Le numero de telephone est requis'],
      unique: true,
      trim: true,
      match: [
        /^\+221[7][0-9]{8}$/,
        'Format de telephone invalide (ex: +221771234567)',
      ],
    },
    adresse: {
      type: String,
      trim: true,
      maxlength: [200, 'L\'adresse ne peut pas depasser 200 caracteres'],
    },
    carteIdentite: {
      type: String,
      required: [true, 'La carte d\'identite est requise'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    dateNaissance: {
      type: Date,
      required: [true, 'La date de naissance est requise'],
      validate: {
        validator: function (value) {
          const age = Math.floor((Date.now() - value) / (365.25 * 24 * 60 * 60 * 1000));
          return age >= 18;
        },
        message: 'L\'utilisateur doit avoir au moins 18 ans',
      },
    },

    // PHOTOS
    photoIdentite: {
      url: {
        type: String,
      },
      publicId: {
        type: String, 
      },
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
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
      minlength: [8, 'Le mot de passe doit contenir au moins 8 caracteres'],
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

role: {
      type: String,
      enum: {
        values: ROLE_VALUES, // ['admin', 'tresorier', 'membre']
        message: 'Le rôle doit être admin, tresorier ou membre',
      },
      required: [true, 'Le role est requis'],
      default: ROLES.MEMBRE,
      // ✅ NORMALISATION : Convertit tout en minuscules + mapping
      set: function(value) {
        if (!value) return ROLES.MEMBRE;
        
        // Map les anciens formats vers les nouveaux
        const roleMap = {
          'admin': 'admin',
          'Admin': 'admin',
          'ADMIN': 'admin',
          'administrateur': 'admin',
          'Administrateur': 'admin',
          'ADMINISTRATEUR': 'admin',
          'tresorier': 'tresorier',
          'Tresorier': 'tresorier',
          'TRESORIER': 'tresorier',
          'membre': 'membre',
          'Membre': 'membre',
          'MEMBRE': 'membre',
        };
        
        return roleMap[value] || value.toLowerCase();
      }
    },
     isActive: {
      type: Boolean,
      default: true,
      index: true,
    },


    // Tokens et securite
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    
    loginOTP: {
      code: String,
      codeExpiry: Date,
      attempts: { type: Number, default: 0 },
    },

    // pour confirmation changement de mot de passe
    pendingPasswordChange: {
      newPasswordHash: String,
      confirmationToken: String,
      confirmationExpiry: Date,
      requestedAt: Date,
    },
    
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

    // Preferences
    preferences: {
      receiveEmailNotifications: { type: Boolean, default: true },
      receivePushNotifications: { type: Boolean, default: true },
      receiveSMS: { type: Boolean, default: false },
      language: { type: String, default: 'fr' },
    },

    // Metadonnees
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

UserSchema.virtual('cni').get(function () {
  return this.carteIdentite;
});

UserSchema.virtual('telephone').get(function () {
  return this.numeroTelephone;
});

UserSchema.virtual('photoIdentiteUrl').get(function () {
  return this.photoIdentite?.url || null;
});

UserSchema.virtual('photoProfilUrl').get(function () {
  return this.photoProfil?.url || null;
});

// ========================================
// HOOKS (MIDDLEWARE)
// ========================================

// Hash password avant sauvegarde
UserSchema.pre('save', async function (next) {
  if (!this.isModified('motDePasse')) return next();

  if (this._skipPasswordHash) {
    delete this._skipPasswordHash;
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS) || 10);
    this.motDePasse = await bcrypt.hash(this.motDePasse, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Mettre a jour lastModifiedBy
UserSchema.pre('save', function (next) {
  if (this.isModified() && !this.isNew && this._updateUserId) {
    this.lastModifiedBy = this._updateUserId;
  }
  next();
});

// Verrouiller la photo d'identite apres creation
UserSchema.pre('save', function (next) {
  if (this.isNew && this.photoIdentite) {
    this.photoIdentite.isLocked = true;
  }
  next();
});

// ========================================
// METHODES D'INSTANCE
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

UserSchema.methods.updateProfilePhoto = function (url, publicId) {
  this.photoProfil = {
    url,
    publicId,
    uploadedAt: Date.now(),
  };
};

UserSchema.methods.generateLoginOTP = function () {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const crypto = require('crypto');
  this.loginOTP = {
    code: crypto.createHash('sha256').update(code).digest('hex'),
    codeExpiry: Date.now() + 15 * 60 * 1000,
    attempts: 0,
  };
  return code;
};

UserSchema.methods.verifyLoginOTP = function (code) {
  const crypto = require('crypto');
  
  if (Date.now() > this.loginOTP.codeExpiry) {
    return { success: false, message: 'Code expire' };
  }

  if (this.loginOTP.attempts >= 3) {
    return { success: false, message: 'Nombre maximum de tentatives atteint' };
  }

  const hashedInput = crypto.createHash('sha256').update(code).digest('hex');
  this.loginOTP.attempts += 1;

  if (hashedInput === this.loginOTP.code) {
    this.loginOTP = {
      code: undefined,
      codeExpiry: undefined,
      attempts: 0,
    };
    return { success: true, message: 'Code valide' };
  }

  return { success: false, message: 'Code incorrect' };
};

UserSchema.methods.createPendingPasswordChange = async function (newPassword) {
  const crypto = require('crypto');
  const bcrypt = require('bcryptjs');
  
  const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS) || 10);
  const newPasswordHash = await bcrypt.hash(newPassword, salt);
  
  const confirmationToken = crypto.randomBytes(32).toString('hex');
  
  this.pendingPasswordChange = {
    newPasswordHash,
    confirmationToken: crypto.createHash('sha256').update(confirmationToken).digest('hex'),
    confirmationExpiry: Date.now() + 30 * 60 * 1000,
    requestedAt: Date.now(),
  };
  
  return confirmationToken;
};

UserSchema.methods.confirmPasswordChange = function (token) {
  const crypto = require('crypto');
  
  if (!this.pendingPasswordChange || !this.pendingPasswordChange.confirmationToken) {
    return { success: false, message: 'Aucun changement de mot de passe en attente' };
  }
  
  if (Date.now() > this.pendingPasswordChange.confirmationExpiry) {
    this.pendingPasswordChange = undefined;
    return { success: false, message: 'Lien de confirmation expire' };
  }
  
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  
  if (hashedToken === this.pendingPasswordChange.confirmationToken) {
    this.motDePasse = this.pendingPasswordChange.newPasswordHash;
    this._skipPasswordHash = true;
    this.lastPasswordChange = Date.now();
    this.isFirstLogin = false;
    this.pendingPasswordChange = undefined;
    
    return { success: true, message: 'Mot de passe change avec succes' };
  }
  
  return { success: false, message: 'Lien de confirmation invalide' };
};

UserSchema.methods.rejectPasswordChange = function (token) {
  const crypto = require('crypto');
  
  if (!this.pendingPasswordChange || !this.pendingPasswordChange.confirmationToken) {
    return { success: false, message: 'Aucun changement de mot de passe en attente' };
  }
  
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  
  if (hashedToken === this.pendingPasswordChange.confirmationToken) {
    this.pendingPasswordChange = undefined;
    return { success: true, message: 'Changement de mot de passe annule' };
  }
  
  return { success: false, message: 'Lien invalide' };
};

// ========================================
// METHODES STATIQUES
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