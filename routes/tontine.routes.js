// routes/tontine.routes.js
const express = require('express');
const router = express.Router();

const {
  createTontine,
  addMembers,
  removeMember,
  activateTontine,
  updateTontine,
  blockTontine,
  unblockTontine,
  closeTontine,
  deleteTontine,
  listTontines,
  getTontineDetails,
} = require('../controllers/tontine.controller');

const {
  validateCreateTontine,
  validateUpdateTontine,
  validateAddMembers,
  validateRemoveMember,
  validateActivateTontine,
  validateBlockTontine,
  validateCloseTontine,
  validateDeleteTontine,
  validateListTontines,
  validateTontineId,
} = require('../validators/tontine.validator');

const { validate } = require('../middleware/validator.middleware');
const { verifyToken } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/role.middleware');
const { auditLog } = require('../middleware/audit.middleware');

// ========================================
// ROUTES ADMIN - GESTION TONTINES
// ========================================

/**
 * @route   GET /digitontine/tontines
 * @desc    Liste des tontines avec filtres
 * @access  Admin
 * US 2.10
 */
router.get(
  '/',
  verifyToken,
  isAdmin,
  validateListTontines,
  validate,
  listTontines
);

/**
 * @route   POST /digitontine/tontines
 * @desc    Créer une nouvelle tontine
 * @access  Admin
 * US 2.1
 */
router.post(
  '/',
  verifyToken,
  isAdmin,
  validateCreateTontine,
  validate,
  auditLog('CREATE_TONTINE', 'Tontine'),
  createTontine
);

/**
 * @route   GET /digitontine/tontines/:tontineId
 * @desc    Détails d'une tontine
 * @access  Admin
 * US 2.11
 */
router.get(
  '/:tontineId',
  verifyToken,
  isAdmin,
  validateTontineId,
  validate,
  getTontineDetails
);

/**
 * @route   PUT /digitontine/tontines/:tontineId
 * @desc    Modifier une tontine
 * @access  Admin
 * US 2.5
 */
router.put(
  '/:tontineId',
  verifyToken,
  isAdmin,
  validateUpdateTontine,
  validate,
  auditLog('UPDATE_TONTINE', 'Tontine'),
  updateTontine
);

/**
 * @route   DELETE /digitontine/tontines/:tontineId
 * @desc    Supprimer une tontine
 * @access  Admin
 * US 2.9
 */
router.delete(
  '/:tontineId',
  verifyToken,
  isAdmin,
  validateDeleteTontine,
  validate,
  auditLog('DELETE_TONTINE', 'Tontine'),
  deleteTontine
);

// ========================================
// ROUTES - GESTION MEMBRES
// ========================================

/**
 * @route   POST /digitontine/tontines/:tontineId/membres
 * @desc    Ajouter des membres à une tontine
 * @access  Admin
 * US 2.2
 */
router.post(
  '/:tontineId/membres',
  verifyToken,
  isAdmin,
  validateAddMembers,
  validate,
  auditLog('ADD_MEMBRES_TONTINE', 'Tontine'),
  addMembers
);

/**
 * @route   DELETE /digitontine/tontines/:tontineId/membres/:userId
 * @desc    Retirer un membre d'une tontine
 * @access  Admin
 * US 2.3
 */
router.delete(
  '/:tontineId/membres/:userId',
  verifyToken,
  isAdmin,
  validateRemoveMember,
  validate,
  auditLog('REMOVE_MEMBRE_TONTINE', 'Tontine'),
  removeMember
);

// ========================================
// ROUTES - ACTIONS SUR TONTINES
// ========================================

/**
 * @route   POST /digitontine/tontines/:tontineId/activate
 * @desc    Activer une tontine
 * @access  Admin
 * US 2.4
 */
router.post(
  '/:tontineId/activate',
  verifyToken,
  isAdmin,
  validateActivateTontine,
  validate,
  auditLog('ACTIVATE_TONTINE', 'Tontine'),
  activateTontine
);

/**
 * @route   POST /digitontine/tontines/:tontineId/block
 * @desc    Bloquer une tontine
 * @access  Admin
 * US 2.6
 */
router.post(
  '/:tontineId/block',
  verifyToken,
  isAdmin,
  validateBlockTontine,
  validate,
  auditLog('BLOCK_TONTINE', 'Tontine'),
  blockTontine
);

/**
 * @route   POST /digitontine/tontines/:tontineId/unblock
 * @desc    Débloquer/Réactiver une tontine
 * @access  Admin
 * US 2.7
 */
router.post(
  '/:tontineId/unblock',
  verifyToken,
  isAdmin,
  validateTontineId,
  validate,
  auditLog('UNBLOCK_TONTINE', 'Tontine'),
  unblockTontine
);

/**
 * @route   POST /digitontine/tontines/:tontineId/close
 * @desc    Clôturer une tontine
 * @access  Admin
 * US 2.8
 */
router.post(
  '/:tontineId/close',
  verifyToken,
  isAdmin,
  validateCloseTontine,
  validate,
  auditLog('CLOSE_TONTINE', 'Tontine'),
  closeTontine
);
/**
 * @swagger
 * /digitontine/tontines:
 *   post:
 *     tags: [Tontines]
 *     summary: Créer une tontine (Admin)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom, montantCotisation, frequence, dateDebut]
 *             properties:
 *               nom: { type: string }
 *               montantCotisation: { type: number }
 *               frequence: { type: string, enum: [Hebdomadaire, Mensuelle] }
 *               dateDebut: { type: string, format: date }
 *     responses:
 *       201:
 *         description: Tontine créée
 */

/**
 * @swagger
 * /digitontine/tontines:
 *   get:
 *     tags: [Tontines]
 *     summary: Liste des tontines
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Liste paginée
 */

module.exports = router;