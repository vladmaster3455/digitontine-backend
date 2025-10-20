// validators/auth.validator.js
const { body } = require('express-validator');
const { isValidSenegalPhone } = require('../utils/helpers');

/**
 * Validation login (email OU téléphone + mot de passe)
 */
const validateLogin = [
  body('identifier')
    .trim()
    .notEmpty()
    .withMessage('Email ou numéro de téléphone requis')
    .custom((value) => {
      const isEmail = value.includes('@');
      const isPhone = isValidSenegalPhone(value);
      
      if (!isEmail && !isPhone) {
        throw new Error('Format email ou téléphone invalide');
      }
      return true;
    }),

  body('motDePasse')
    .trim()
    .notEmpty()
    .withMessage('Le mot de passe est requis')
    .isLength({ min: 8 })
    .withMessage('Le mot de passe doit contenir au moins 8 caractères'),
];

/**
 * Validation changement de mot de passe (première connexion)
 */
const validateFirstPasswordChange = [
  body('ancienMotDePasse')
    .trim()
    .notEmpty()
    .withMessage('L\'ancien mot de passe est requis'),

  body('nouveauMotDePasse')
    .trim()
    .notEmpty()
    .withMessage('Le nouveau mot de passe est requis')
    .isLength({ min: 8 })
    .withMessage('Le mot de passe doit contenir au moins 8 caractères')
    .matches(/[A-Z]/)
    .withMessage('Le mot de passe doit contenir au moins une majuscule')
    .matches(/[a-z]/)
    .withMessage('Le mot de passe doit contenir au moins une minuscule')
    .matches(/[0-9]/)
    .withMessage('Le mot de passe doit contenir au moins un chiffre')
    .matches(/[@#$%&*!]/)
    .withMessage('Le mot de passe doit contenir au moins un caractère spécial (@#$%&*!)'),

  body('confirmationMotDePasse')
    .trim()
    .notEmpty()
    .withMessage('La confirmation du mot de passe est requise')
    .custom((value, { req }) => {
      if (value !== req.body.nouveauMotDePasse) {
        throw new Error('Les mots de passe ne correspondent pas');
      }
      return true;
    }),
];

/**
 * Validation changement de mot de passe volontaire
 */
const validatePasswordChange = [
  body('ancienMotDePasse')
    .trim()
    .notEmpty()
    .withMessage('L\'ancien mot de passe est requis'),

  body('nouveauMotDePasse')
    .trim()
    .notEmpty()
    .withMessage('Le nouveau mot de passe est requis')
    .isLength({ min: 8 })
    .withMessage('Le mot de passe doit contenir au moins 8 caractères')
    .matches(/[A-Z]/)
    .withMessage('Le mot de passe doit contenir au moins une majuscule')
    .matches(/[a-z]/)
    .withMessage('Le mot de passe doit contenir au moins une minuscule')
    .matches(/[0-9]/)
    .withMessage('Le mot de passe doit contenir au moins un chiffre')
    .matches(/[@#$%&*!]/)
    .withMessage('Le mot de passe doit contenir au moins un caractère spécial (@#$%&*!)')
    .custom((value, { req }) => {
      if (value === req.body.ancienMotDePasse) {
        throw new Error('Le nouveau mot de passe doit être différent de l\'ancien');
      }
      return true;
    }),

  body('confirmationMotDePasse')
    .trim()
    .notEmpty()
    .withMessage('La confirmation du mot de passe est requise')
    .custom((value, { req }) => {
      if (value !== req.body.nouveauMotDePasse) {
        throw new Error('Les mots de passe ne correspondent pas');
      }
      return true;
    }),
];

/**
 * Validation demande de réinitialisation de mot de passe
 */
const validateForgotPassword = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('L\'email est requis')
    .isEmail()
    .withMessage('Format d\'email invalide')
    .normalizeEmail(),
];

/**
 * Validation réinitialisation de mot de passe avec code
 */
const validateResetPassword = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('L\'email est requis')
    .isEmail()
    .withMessage('Format d\'email invalide')
    .normalizeEmail(),

  body('code')
    .trim()
    .notEmpty()
    .withMessage('Le code de vérification est requis')
    .isLength({ min: 6, max: 6 })
    .withMessage('Le code doit contenir 6 chiffres')
    .isNumeric()
    .withMessage('Le code doit être numérique'),

  body('nouveauMotDePasse')
    .trim()
    .notEmpty()
    .withMessage('Le nouveau mot de passe est requis')
    .isLength({ min: 8 })
    .withMessage('Le mot de passe doit contenir au moins 8 caractères')
    .matches(/[A-Z]/)
    .withMessage('Le mot de passe doit contenir au moins une majuscule')
    .matches(/[a-z]/)
    .withMessage('Le mot de passe doit contenir au moins une minuscule')
    .matches(/[0-9]/)
    .withMessage('Le mot de passe doit contenir au moins un chiffre')
    .matches(/[@#$%&*!]/)
    .withMessage('Le mot de passe doit contenir au moins un caractère spécial (@#$%&*!)'),

  body('confirmationMotDePasse')
    .trim()
    .notEmpty()
    .withMessage('La confirmation du mot de passe est requise')
    .custom((value, { req }) => {
      if (value !== req.body.nouveauMotDePasse) {
        throw new Error('Les mots de passe ne correspondent pas');
      }
      return true;
    }),
];

/**
 * Validation enregistrement token FCM (push notifications)
 */
const validateFCMToken = [
  body('fcmToken')
    .trim()
    .notEmpty()
    .withMessage('Le token FCM est requis')
    .isLength({ min: 10 })
    .withMessage('Token FCM invalide'),

  body('device')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Le nom du device ne peut pas dépasser 100 caractères'),
];

/**
 * Validation refresh token
 */
const validateRefreshToken = [
  body('refreshToken')
    .trim()
    .notEmpty()
    .withMessage('Le refresh token est requis'),
];

module.exports = {
  validateLogin,
  validateFirstPasswordChange,
  validatePasswordChange,
  validateForgotPassword,
  validateResetPassword,
  validateFCMToken,
  validateRefreshToken,
};