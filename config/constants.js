// config/constants.js

module.exports = {
  // Informations application
  APP: {
    NAME: process.env.APP_NAME || 'DigiTontine',
    VERSION: process.env.API_VERSION || 'v1',
    DESCRIPTION: process.env.API_DESCRIPTION || 'API Backend pour la gestion de tontines digitales',
    PORT: process.env.PORT || 5000,
  },

  // Rôles utilisateurs
  ROLES: {
    ADMIN: 'Admin',
    TRESORIER: 'Tresorier',
    MEMBRE: 'Membre',
  },

  // Statuts des tontines
  TONTINE_STATUS: {
    EN_ATTENTE: 'En attente',
    ACTIVE: 'Active',
    BLOQUEE: 'Bloquée',
    TERMINEE: 'Terminée',
  },

  // Fréquences de cotisation
  FREQUENCES: {
    HEBDOMADAIRE: 'hebdomadaire',
    MENSUELLE: 'mensuelle',
  },

  // Statuts des transactions
  TRANSACTION_STATUS: {
    EN_ATTENTE: 'En attente',
    VALIDEE: 'Validée',
    REJETEE: 'Rejetée',
  },

  // Types de transactions
  TRANSACTION_TYPES: {
    COTISATION: 'cotisation',
    PENALITE: 'penalite',
    TIRAGE: 'tirage',
  },

  // Moyens de paiement
  PAYMENT_METHODS: {
    WAVE: 'Wave',
    ORANGE_MONEY: 'Orange Money',
    CASH: 'Cash',
  },

  // Codes HTTP
  HTTP_STATUS: {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNPROCESSABLE_ENTITY: 422,
    INTERNAL_SERVER_ERROR: 500,
  },

  // Messages d'erreur communs
  ERROR_MESSAGES: {
    UNAUTHORIZED: 'Accès non autorisé',
    FORBIDDEN: 'Vous n\'avez pas les permissions nécessaires',
    NOT_FOUND: 'Ressource non trouvée',
    INVALID_CREDENTIALS: 'Identifiants incorrects',
    INVALID_TOKEN: 'Token invalide ou expiré',
    INVALID_API_KEY: 'Clé API invalide',
    SERVER_ERROR: 'Erreur serveur, veuillez réessayer',
    VALIDATION_ERROR: 'Erreur de validation des données',
  },

  // Messages de succès
  SUCCESS_MESSAGES: {
    LOGIN: 'Connexion réussie',
    LOGOUT: 'Déconnexion réussie',
    CREATED: 'Créé avec succès',
    UPDATED: 'Mis à jour avec succès',
    DELETED: 'Supprimé avec succès',
    PASSWORD_CHANGED: 'Mot de passe changé avec succès',
    EMAIL_SENT: 'Email envoyé avec succès',
  },

  // Pagination
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 100,
  },

  // Validation mot de passe
  PASSWORD_RULES: {
    MIN_LENGTH: 8,
    REQUIRE_UPPERCASE: true,
    REQUIRE_LOWERCASE: true,
    REQUIRE_NUMBER: true,
    REQUIRE_SPECIAL_CHAR: true,
  },

  // Pénalités (défauts)
  PENALTIES: {
    DEFAULT_RATE: parseInt(process.env.DEFAULT_PENALTY_RATE) || 5,
    GRACE_PERIOD_DAYS: parseInt(process.env.DEFAULT_GRACE_PERIOD_DAYS) || 2,
  },

  // Rappels
  REMINDERS: {
    J_MINUS_3: process.env.REMINDER_J_MINUS_3 === 'true',
    J: process.env.REMINDER_J === 'true',
    J_PLUS_2: process.env.REMINDER_J_PLUS_2 === 'true',
    HOUR: process.env.REMINDER_HOUR || '09:00',
  },

  // Fichiers
  UPLOAD: {
    MAX_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 5242880, // 5MB
    ALLOWED_TYPES: (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/jpg,application/pdf').split(','),
    DIR: process.env.UPLOAD_DIR || './uploads',
  },

  // Rate limiting
  RATE_LIMIT: {
    WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
    MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    LOGIN_MAX: parseInt(process.env.RATE_LIMIT_LOGIN_MAX) || 5,
  },
};