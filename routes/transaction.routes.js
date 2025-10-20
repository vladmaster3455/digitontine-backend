// routes/transaction.routes.js
const express = require('express');
const router = express.Router();

const {
  createTransaction,
  validateTransaction,
  rejectTransaction,
  listTransactions,
  getTransactionDetails,
  getMyTransactions,
  handleWaveWebhook,
} = require('../controllers/transaction.controller');

const {
  validateCreateTransaction,
  validateValidateTransaction,
  validateRejectTransaction,
  validateListTransactions,
  validateTransactionId,
  validateWebhook,
} = require('../validators/transaction.validator');

const { validate } = require('../middleware/validator.middleware');
const { verifyToken } = require('../middleware/auth.middleware');
const { isAdminOrTresorier, isTresorier } = require('../middleware/role.middleware');
const { auditLog } = require('../middleware/audit.middleware');

// ========================================
// ROUTES PUBLIQUES - WEBHOOKS
// ========================================

/**
 * @route   POST /digitontine/transactions/webhook/wave
 * @desc    Webhook Wave (callback paiement)
 * @access  Public (validation interne)
 */
router.post('/webhook/wave', validateWebhook, validate, handleWaveWebhook);

// ========================================
// ROUTES MEMBRES - MES TRANSACTIONS
// ========================================

/**
 * @route   GET /digitontine/transactions/me
 * @desc    Mes transactions
 * @access  Private (Membre)
 * US 4.9
 */
router.get('/me', verifyToken, getMyTransactions);

/**
 * @route   POST /digitontine/transactions
 * @desc    Effectuer une cotisation
 * @access  Private (Membre)
 * US 4.1
 */
router.post(
  '/',
  verifyToken,
  validateCreateTransaction,
  validate,
  auditLog('CREATE_TRANSACTION', 'Transaction'),
  createTransaction
);

// ========================================
// ROUTES TRÉSORIER - GESTION TRANSACTIONS
// ========================================

/**
 * @route   GET /digitontine/transactions
 * @desc    Liste des transactions (avec filtres)
 * @access  Trésorier/Admin
 * US 4.4
 */
router.get(
  '/',
  verifyToken,
  isAdminOrTresorier,
  validateListTransactions,
  validate,
  listTransactions
);

/**
 * @route   POST /digitontine/transactions/:transactionId/validate
 * @desc    Valider une transaction
 * @access  Trésorier
 * US 4.3
 */
router.post(
  '/:transactionId/validate',
  verifyToken,
  isTresorier,
  validateValidateTransaction,
  validate,
  auditLog('VALIDATE_TRANSACTION', 'Transaction'),
  validateTransaction
);

/**
 * @route   POST /digitontine/transactions/:transactionId/reject
 * @desc    Rejeter une transaction
 * @access  Trésorier
 * US 4.3
 */
router.post(
  '/:transactionId/reject',
  verifyToken,
  isTresorier,
  validateRejectTransaction,
  validate,
  auditLog('REJECT_TRANSACTION', 'Transaction'),
  rejectTransaction
);

/**
 * @route   GET /digitontine/transactions/:transactionId
 * @desc    Détails d'une transaction
 * @access  Private (propriétaire ou Trésorier/Admin)
 */
router.get(
  '/:transactionId',
  verifyToken,
  validateTransactionId,
  validate,
  getTransactionDetails
);

module.exports = router;