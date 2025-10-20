// validators/user.validator.js
const { body, param, query } = require('express-validator');
const { ROLES } = require('../config/constants');
const { isValidSenegalPhone } = require('../utils/helpers');

/**
 * Validation création utilisateur (Membre ou Trésorier)
 */
const validateCreateUser = [
  body('prenom')
    .trim()
    .notEmpty()
    .withMessage('Le prénom est requis')
    .isLength({ min: 2, max: 50 })
    .withMessage('Le prénom doit contenir entre 2 et 50 caractères')
    .matches(/^[a-zA-ZÀ-ÿ\s'-]+$/)
    .withMessage('Le prénom ne peut contenir que des lettres'),

  body('nom')
    .trim()
    .notEmpty()
    .withMessage('Le nom est requis')
    .isLength({ min: 2, max: 50 })
    .withMessage('Le nom doit contenir entre 2 et 50 caractères')
    .matches(/^[a-zA-ZÀ-ÿ\s'-]+$/)
    .withMessage('Le nom ne peut contenir que des lettres'),

  body('email')
    .trim()
    .notEmpty()
    .withMessage('L\'email est requis')
    .isEmail()
    .withMessage('Format d\'email invalide')
    .normalizeEmail(),

  body('numeroTelephone')
    .trim()
    .notEmpty()
    .withMessage('Le numéro de téléphone est requis')
    .custom((value) => {
      if (!isValidSenegalPhone(value)) {
        throw new Error('Format de téléphone invalide (ex: +221771234567)');
      }
      return true;
    }),

  body('adresse')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('L\'adresse ne peut pas dépasser 200 caractères'),

  body('carteIdentite')
    .trim()
    .notEmpty()
    .withMessage('La carte d\'identité est requise')
    .isLength({ min: 5, max: 20 })
    .withMessage('La carte d\'identité doit contenir entre 5 et 20 caractères')
    .matches(/^[A-Z0-9]+$/)
    .withMessage('La carte d\'identité ne peut contenir que des lettres majuscules et chiffres'),

  body('dateNaissance')
    .notEmpty()
    .withMessage('La date de naissance est requise')
    .isISO8601()
    .withMessage('Format de date invalide (YYYY-MM-DD)')
    .custom((value) => {
      const birthDate = new Date(value);
      const age = Math.floor((Date.now() - birthDate) / (365.25 * 24 * 60 * 60 * 1000));
      
      if (age < 18) {
        throw new Error('L\'utilisateur doit avoir au moins 18 ans');
      }
      
      if (age > 100) {
        throw new Error('Date de naissance invalide');
      }
      
      return true;
    }),

  body('role')
    .optional()
    .isIn([ROLES.MEMBRE, ROLES.TRESORIER])
    .withMessage(`Le rôle doit être ${ROLES.MEMBRE} ou ${ROLES.TRESORIER}`),
];

/**
 * Validation modification utilisateur
 */
const validateUpdateUser = [
  param('userId')
    .notEmpty()
    .withMessage('L\'ID utilisateur est requis')
    .isMongoId()
    .withMessage('ID utilisateur invalide'),

  body('prenom')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le prénom doit contenir entre 2 et 50 caractères')
    .matches(/^[a-zA-ZÀ-ÿ\s'-]+$/)
    .withMessage('Le prénom ne peut contenir que des lettres'),

  body('nom')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le nom doit contenir entre 2 et 50 caractères')
    .matches(/^[a-zA-ZÀ-ÿ\s'-]+$/)
    .withMessage('Le nom ne peut contenir que des lettres'),

  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Format d\'email invalide')
    .normalizeEmail(),

  body('numeroTelephone')
    .optional()
    .trim()
    .custom((value) => {
      if (value && !isValidSenegalPhone(value)) {
        throw new Error('Format de téléphone invalide (ex: +221771234567)');
      }
      return true;
    }),

  body('adresse')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('L\'adresse ne peut pas dépasser 200 caractères'),

  body('dateNaissance')
    .optional()
    .isISO8601()
    .withMessage('Format de date invalide (YYYY-MM-DD)')
    .custom((value) => {
      if (value) {
        const birthDate = new Date(value);
        const age = Math.floor((Date.now() - birthDate) / (365.25 * 24 * 60 * 60 * 1000));
        
        if (age < 18 || age > 100) {
          throw new Error('Date de naissance invalide');
        }
      }
      return true;
    }),

  body('role')
    .optional()
    .isIn([ROLES.MEMBRE, ROLES.TRESORIER])
    .withMessage(`Le rôle doit être ${ROLES.MEMBRE} ou ${ROLES.TRESORIER}`),
];

/**
 * Validation modification profil utilisateur (par lui-même)
 */
const validateUpdateProfile = [
  body('numeroTelephone')
    .optional()
    .trim()
    .custom((value) => {
      if (value && !isValidSenegalPhone(value)) {
        throw new Error('Format de téléphone invalide (ex: +221771234567)');
      }
      return true;
    }),

  body('adresse')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('L\'adresse ne peut pas dépasser 200 caractères'),

  body('preferences')
    .optional()
    .isObject()
    .withMessage('Les préférences doivent être un objet'),

  body('preferences.receiveEmailNotifications')
    .optional()
    .isBoolean()
    .withMessage('Doit être un booléen'),

  body('preferences.receivePushNotifications')
    .optional()
    .isBoolean()
    .withMessage('Doit être un booléen'),

  body('preferences.receiveSMS')
    .optional()
    .isBoolean()
    .withMessage('Doit être un booléen'),
];

/**
 * Validation activation/désactivation compte
 */
const validateToggleActivation = [
  param('userId')
    .notEmpty()
    .withMessage('L\'ID utilisateur est requis')
    .isMongoId()
    .withMessage('ID utilisateur invalide'),

  body('raison')
    .optional()
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('La raison doit contenir entre 10 et 500 caractères'),
];

/**
 * Validation suppression compte
 */
const validateDeleteUser = [
  param('userId')
    .notEmpty()
    .withMessage('L\'ID utilisateur est requis')
    .isMongoId()
    .withMessage('ID utilisateur invalide'),

  body('confirmation')
    .notEmpty()
    .withMessage('La confirmation est requise')
    .equals('SUPPRIMER')
    .withMessage('Vous devez taper "SUPPRIMER" pour confirmer'),

  body('raison')
    .optional()
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('La raison doit contenir entre 10 et 500 caractères'),
];

/**
 * Validation liste utilisateurs (query params)
 */
const validateListUsers = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Le numéro de page doit être un entier positif'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('La limite doit être entre 1 et 100'),

  query('role')
    .optional()
    .isIn(Object.values(ROLES))
    .withMessage('Rôle invalide'),

  query('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive doit être un booléen'),

  query('search')
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage('La recherche doit contenir au moins 2 caractères'),
];

/**
 * Validation ID utilisateur (param)
 */
const validateUserId = [
  param('userId')
    .notEmpty()
    .withMessage('L\'ID utilisateur est requis')
    .isMongoId()
    .withMessage('ID utilisateur invalide'),
];

/**
 * Validation réinitialisation manuelle mot de passe (par Admin)
 */
const validateAdminResetPassword = [
  param('userId')
    .notEmpty()
    .withMessage('L\'ID utilisateur est requis')
    .isMongoId()
    .withMessage('ID utilisateur invalide'),

  body('notifyUser')
    .optional()
    .isBoolean()
    .withMessage('notifyUser doit être un booléen'),
];

module.exports = {
  validateCreateUser,
  validateUpdateUser,
  validateUpdateProfile,
  validateToggleActivation,
  validateDeleteUser,
  validateListUsers,
  validateUserId,
  validateAdminResetPassword,
};