// validators/auth.validator.js
const { body, param, query } = require('express-validator');
const { isValidSenegalPhone } = require('../utils/helpers');

/**
 * Validation login (email OU telephone + mot de passe)
 */
const validateLogin = [
  body('identifier')
    .trim()
    .notEmpty()
    .withMessage('Email ou numero de telephone requis')
    .custom((value) => {
      // Vérifier si c'est un email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const isEmail = emailRegex.test(value);
      
      // Si c'est un email, accepter directement
      if (isEmail) {
        return true;
      }
      
      // Sinon, vérifier si c'est un téléphone valide
      const isPhone = isValidSenegalPhone(value);
      
      if (!isPhone) {
        throw new Error('Format email ou telephone invalide');
      }
      
      return true;
    }),

  body('motDePasse')
    .trim()
    .notEmpty()
    .withMessage('Le mot de passe est requis')
    .isLength({ min: 8 })
    .withMessage('Le mot de passe doit contenir au moins 8 caracteres'),
];

/**
 * Validation verification OTP de connexion
 */
const validateVerifyLoginOTP = [
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
    .withMessage('Le code OTP est requis')
    .isLength({ min: 6, max: 6 })
    .withMessage('Le code doit contenir 6 chiffres')
    .isNumeric()
    .withMessage('Le code doit etre numerique'),
];

/**
 * Validation changement de mot de passe (premiere connexion)
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
    .withMessage('Le mot de passe doit contenir au moins 8 caracteres')
    .matches(/[A-Z]/)
    .withMessage('Le mot de passe doit contenir au moins une majuscule')
    .matches(/[a-z]/)
    .withMessage('Le mot de passe doit contenir au moins une minuscule')
    .matches(/[0-9]/)
    .withMessage('Le mot de passe doit contenir au moins un chiffre')
    .matches(/[@#$%&*!]/)
    .withMessage('Le mot de passe doit contenir au moins un caractere special (@#$%&*!)')
    .custom((value, { req }) => {
      if (value === req.body.ancienMotDePasse) {
        throw new Error('Le nouveau mot de passe doit etre different de l\'ancien');
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
    .withMessage('Le mot de passe doit contenir au moins 8 caracteres')
    .matches(/[A-Z]/)
    .withMessage('Le mot de passe doit contenir au moins une majuscule')
    .matches(/[a-z]/)
    .withMessage('Le mot de passe doit contenir au moins une minuscule')
    .matches(/[0-9]/)
    .withMessage('Le mot de passe doit contenir au moins un chiffre')
    .matches(/[@#$%&*!]/)
    .withMessage('Le mot de passe doit contenir au moins un caractere special (@#$%&*!)')
    .custom((value, { req }) => {
      if (value === req.body.ancienMotDePasse) {
        throw new Error('Le nouveau mot de passe doit etre different de l\'ancien');
      }
      return true;
    }),
];

/**
 * Validation demande de reinitialisation de mot de passe
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
 * Validation reinitialisation de mot de passe avec code
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
    .withMessage('Le code de verification est requis')
    .isLength({ min: 6, max: 6 })
    .withMessage('Le code doit contenir 6 chiffres')
    .isNumeric()
    .withMessage('Le code doit etre numerique'),

  body('nouveauMotDePasse')
    .trim()
    .notEmpty()
    .withMessage('Le nouveau mot de passe est requis')
    .isLength({ min: 8 })
    .withMessage('Le mot de passe doit contenir au moins 8 caracteres')
    .matches(/[A-Z]/)
    .withMessage('Le mot de passe doit contenir au moins une majuscule')
    .matches(/[a-z]/)
    .withMessage('Le mot de passe doit contenir au moins une minuscule')
    .matches(/[0-9]/)
    .withMessage('Le mot de passe doit contenir au moins un chiffre')
    .matches(/[@#$%&*!]/)
    .withMessage('Le mot de passe doit contenir au moins un caractere special (@#$%&*!)'),
];

/**
 * Validation token de confirmation changement MDP
 */
const validateConfirmPasswordChange = [
  param('token')
    .trim()
    .notEmpty()
    .withMessage('Le token de confirmation est requis')
    .isLength({ min: 64, max: 64 })
    .withMessage('Token invalide'),

  query('action')
    .notEmpty()
    .withMessage('L\'action est requise')
    .isIn(['approve', 'reject'])
    .withMessage('Action invalide (approve ou reject)'),
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
    .withMessage('Le nom du device ne peut pas depasser 100 caracteres'),
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
  validateVerifyLoginOTP,
  validateFirstPasswordChange,
  validatePasswordChange,
  validateForgotPassword,
  validateResetPassword,
  validateFCMToken,
  validateRefreshToken,
  validateConfirmPasswordChange,
};