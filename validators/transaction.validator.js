// validators/transaction.validator.js
const { body, param, query } = require('express-validator');
const { PAYMENT_METHODS, TRANSACTION_STATUS, TRANSACTION_TYPES } = require('../config/constants');

/**
 * Validation création transaction (cotisation)
 */
const validateCreateTransaction = [
  body('tontineId')
    .notEmpty()
    .withMessage('L\'ID de la tontine est requis')
    .isMongoId()
    .withMessage('ID de tontine invalide'),

  body('montant')
    .notEmpty()
    .withMessage('Le montant est requis')
    .isInt({ min: 1 })
    .withMessage('Le montant doit être un entier positif'),

  body('moyenPaiement')
    .notEmpty()
    .withMessage('Le moyen de paiement est requis')
    .isIn(Object.values(PAYMENT_METHODS))
    .withMessage('Moyen de paiement invalide'),

  body('referencePaiement')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('La référence ne peut pas dépasser 100 caractères'),

  body('echeanceNumero')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Le numéro d\'échéance doit être un entier positif'),
];

/**
 * Validation validation transaction (par Trésorier)
 */
const validateValidateTransaction = [
  param('transactionId')
    .notEmpty()
    .withMessage('L\'ID de la transaction est requis')
    .isMongoId()
    .withMessage('ID de transaction invalide'),

  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Les notes ne peuvent pas dépasser 500 caractères'),
];

/**
 * Validation rejet transaction
 */
const validateRejectTransaction = [
  param('transactionId')
    .notEmpty()
    .withMessage('L\'ID de la transaction est requis')
    .isMongoId()
    .withMessage('ID de transaction invalide'),

  body('motifRejet')
    .notEmpty()
    .withMessage('Le motif de rejet est requis')
    .isLength({ min: 10, max: 500 })
    .withMessage('Le motif doit contenir entre 10 et 500 caractères'),
];

/**
 * Validation webhook paiement (Wave, Orange Money)
 */
const validateWebhook = [
  body('transaction_id')
    .notEmpty()
    .withMessage('L\'ID de transaction est requis'),

  body('status')
    .notEmpty()
    .withMessage('Le statut est requis'),

  body('amount')
    .notEmpty()
    .withMessage('Le montant est requis')
    .isNumeric()
    .withMessage('Le montant doit être numérique'),
];

/**
 * Validation liste transactions
 */
const validateListTransactions = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Le numéro de page doit être un entier positif'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('La limite doit être entre 1 et 100'),

  query('tontineId')
    .optional()
    .isMongoId()
    .withMessage('ID de tontine invalide'),

  query('userId')
    .optional()
    .isMongoId()
    .withMessage('ID utilisateur invalide'),

  query('statut')
    .optional()
    .isIn(Object.values(TRANSACTION_STATUS))
    .withMessage('Statut invalide'),

  query('type')
    .optional()
    .isIn(Object.values(TRANSACTION_TYPES))
    .withMessage('Type de transaction invalide'),

  query('moyenPaiement')
    .optional()
    .isIn(Object.values(PAYMENT_METHODS))
    .withMessage('Moyen de paiement invalide'),

  query('dateDebut')
    .optional()
    .isISO8601()
    .withMessage('Format de date invalide'),

  query('dateFin')
    .optional()
    .isISO8601()
    .withMessage('Format de date invalide'),

  query('minMontant')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Le montant minimum doit être positif'),

  query('maxMontant')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Le montant maximum doit être positif'),
];

/**
 * Validation ID transaction
 */
const validateTransactionId = [
  param('transactionId')
    .notEmpty()
    .withMessage('L\'ID de la transaction est requis')
    .isMongoId()
    .withMessage('ID de transaction invalide'),
];

/**
 * Validation export transactions
 */
const validateExportTransactions = [
  query('format')
    .optional()
    .isIn(['pdf', 'excel'])
    .withMessage('Format invalide (pdf ou excel)'),

  query('tontineId')
    .optional()
    .isMongoId()
    .withMessage('ID de tontine invalide'),

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
 * Validation génération reçu
 */
const validateGenerateReceipt = [
  param('transactionId')
    .notEmpty()
    .withMessage('L\'ID de la transaction est requis')
    .isMongoId()
    .withMessage('ID de transaction invalide'),
];

module.exports = {
  validateCreateTransaction,
  validateValidateTransaction,
  validateRejectTransaction,
  validateWebhook,
  validateListTransactions,
  validateTransactionId,
  validateExportTransactions,
  validateGenerateReceipt,
};