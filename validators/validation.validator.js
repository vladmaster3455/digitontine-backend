// validators/validation.validator.js
const { body, param, query } = require('express-validator');

/**
 * Validation création demande de validation
 */
const validateCreateRequest = [
  body('actionType')
    .notEmpty()
    .withMessage('Le type d\'action est requis')
    .isIn([
      'DELETE_USER',
      'DELETE_TONTINE',
      'BLOCK_TONTINE',
      'UNBLOCK_TONTINE',
      'ACTIVATE_USER',
      'DEACTIVATE_USER',
    ])
    .withMessage('Type d\'action invalide'),

  body('resourceType')
    .notEmpty()
    .withMessage('Le type de ressource est requis')
    .isIn(['User', 'Tontine'])
    .withMessage('Type de ressource invalide'),

  body('resourceId')
    .notEmpty()
    .withMessage('L\'ID de la ressource est requis')
    .isMongoId()
    .withMessage('ID de ressource invalide'),

  body('reason')
    .trim()
    .notEmpty()
    .withMessage('La raison est requise')
    .isLength({ min: 10, max: 500 })
    .withMessage('La raison doit contenir entre 10 et 500 caractères'),

  body('assignedAdminId')
    .optional()
    .isMongoId()
    .withMessage('ID Admin invalide'),
];

/**
 * Validation confirmation OTP Trésorier
 */
const validateConfirmTresorierOTP = [
  param('validationRequestId')
    .notEmpty()
    .withMessage('L\'ID de la demande est requis')
    .isMongoId()
    .withMessage('ID de demande invalide'),

  body('code')
    .trim()
    .notEmpty()
    .withMessage('Le code OTP est requis')
    .isLength({ min: 6, max: 6 })
    .withMessage('Le code doit contenir 6 chiffres')
    .isNumeric()
    .withMessage('Le code doit être numérique'),
];

/**
 * Validation confirmation OTP Admin
 */
const validateConfirmAdminOTP = [
  param('validationRequestId')
    .notEmpty()
    .withMessage('L\'ID de la demande est requis')
    .isMongoId()
    .withMessage('ID de demande invalide'),

  body('code')
    .trim()
    .notEmpty()
    .withMessage('Le code OTP est requis')
    .isLength({ min: 6, max: 6 })
    .withMessage('Le code doit contenir 6 chiffres')
    .isNumeric()
    .withMessage('Le code doit être numérique'),
];

/**
 * Validation rejet demande
 */
const validateRejectRequest = [
  param('validationRequestId')
    .notEmpty()
    .withMessage('L\'ID de la demande est requis')
    .isMongoId()
    .withMessage('ID de demande invalide'),

  body('reason')
    .trim()
    .notEmpty()
    .withMessage('La raison du rejet est requise')
    .isLength({ min: 10, max: 500 })
    .withMessage('La raison doit contenir entre 10 et 500 caractères'),
];

/**
 * Validation renvoi OTP
 */
const validateResendOTP = [
  param('validationRequestId')
    .notEmpty()
    .withMessage('L\'ID de la demande est requis')
    .isMongoId()
    .withMessage('ID de demande invalide'),

  body('otpType')
    .notEmpty()
    .withMessage('Le type d\'OTP est requis')
    .isIn(['tresorier', 'admin'])
    .withMessage('Type d\'OTP invalide (tresorier ou admin)'),
];

/**
 * Validation liste demandes
 */
const validateListRequests = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Le numéro de page doit être un entier positif'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('La limite doit être entre 1 et 100'),

  query('status')
    .optional()
    .isIn(['pending', 'tresorier_validated', 'completed', 'rejected', 'expired'])
    .withMessage('Statut invalide'),

  query('actionType')
    .optional()
    .isIn([
      'DELETE_USER',
      'DELETE_TONTINE',
      'BLOCK_TONTINE',
      'UNBLOCK_TONTINE',
      'ACTIVATE_USER',
      'DEACTIVATE_USER',
    ])
    .withMessage('Type d\'action invalide'),

  query('dateDebut')
    .optional()
    .isISO8601()
    .withMessage('Format de date invalide'),

  query('dateFin')
    .optional()
    .isISO8601()
    .withMessage('Format de date invalide'),
];

/**
 * Validation ID demande
 */
const validateRequestId = [
  param('validationRequestId')
    .notEmpty()
    .withMessage('L\'ID de la demande est requis')
    .isMongoId()
    .withMessage('ID de demande invalide'),
];

module.exports = {
  validateCreateRequest,
  validateConfirmTresorierOTP,
  validateConfirmAdminOTP,
  validateRejectRequest,
  validateResendOTP,
  validateListRequests,
  validateRequestId,
};