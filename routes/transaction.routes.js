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
 * @swagger
 * /digitontine/transactions/me:
 *   get:
 *     tags: [Transactions]
 *     summary: Mes transactions (Membre)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: statut
 *         schema: { type: string, enum: [En attente, Validee, Rejetee] }
 *     responses:
 *       200:
 *         description: Liste paginée
 */

/**
 * @swagger
 * /digitontine/transactions/{transactionId}/validate:
 *   post:
 *     tags: [Transactions]
 *     summary: Valider une transaction (Trésorier)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes: { type: string }
 *     responses:
 *       200:
 *         description: Transaction validée
 */

/**
 * @swagger
 * /digitontine/transactions/{transactionId}/reject:
 *   post:
 *     tags: [Transactions]
 *     summary: Rejeter une transaction (Trésorier)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [motifRejet]
 *             properties:
 *               motifRejet: { type: string }
 *     responses:
 *       200:
 *         description: Transaction rejetée
 */
module.exports = router;