// routes/tontine.routes.js
const express = require('express');
const router = express.Router();

const {
  createTontine,
  addMembers,
  removeMember,
  inviterMembres,
  activateTontine,
  updateTontine,
  blockTontine,
  unblockTontine,
  getTontineDetailsForMember,
  getTontineDetailsWithRoleCheck,
  closeTontine,
  deleteTontine,
  listTontines,
  getTontineDetails,
  getTontineInvitations,  // ✅ AJOUTER ICI
  optInForTirage,
  mesTontines,
} = require('../controllers/tontine.controller');
const { body } = require('express-validator');
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
 * @route   GET /digitontine/tontines/me/tontines
 * @desc    Mes tontines (Membre/Tresorier)
 * @access  Private
 * IMPORTANT: Cette route DOIT etre AVANT /:tontineId
 */
router.get(
  '/me/tontines',
  verifyToken,
  mesTontines
);

/**
 * @route   POST /digitontine/tontines
 * @desc    Creer une nouvelle tontine
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
 * @route   GET /digitontine/tontines/:tontineId/details
 * @desc    Details d'une tontine (accessible aux membres)
 * @access  Private (Membre de la tontine)
 * IMPORTANT: Cette route DOIT etre AVANT /:tontineId
 */
router.get(
  '/:tontineId/details',
  verifyToken,
  validateTontineId,
  validate,
  getTontineDetailsForMember
);

/**
 * @route   GET /digitontine/tontines/:tontineId/invitations
 * @desc    Liste des invitations pour une tontine
 * @access  Admin
 * IMPORTANT: Cette route DOIT etre AVANT /:tontineId
 */
router.get(
  '/:tontineId/invitations',
  verifyToken,
  isAdmin,
  validateTontineId,
  validate,
  getTontineInvitations
);

/**
 * @route   GET /digitontine/tontines/:tontineId
 * @desc    Details d'une tontine
 * @access  Private (Admin/Tresorier/Membre)
 * US 2.11
 */
router.get(
  '/:tontineId',
  verifyToken,
  validateTontineId,
  validate,
  getTontineDetailsWithRoleCheck 
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
 * @desc    Ajouter des membres a une tontine
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
 * @route   POST /digitontine/tontines/:tontineId/inviter-membres
 * @desc    Inviter des membres a une tontine
 * @access  Admin
 */
router.post(
  '/:tontineId/inviter-membres',
  verifyToken,
  isAdmin,
  validateAddMembers,
  validate,
  auditLog('INVITE_MEMBRES_TONTINE', 'Tontine'),
  inviterMembres
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

/**
 * @route   POST /digitontine/tontines/:tontineId/opt-in
 * @desc    Confirmer participation au prochain tirage
 * @access  Private (Membre de la tontine)
 */
router.post(
  '/:tontineId/opt-in',
  verifyToken,
  validateTontineId,
  validate,
  body('participe')
    .optional()
    .isBoolean()
    .withMessage('participe doit etre un booleen'),
  validate,
  auditLog('TIRAGE_OPT_IN', 'Tontine'),
  optInForTirage
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
 * @desc    Debloquer/Reactiver une tontine
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
 * @desc    Cloturer une tontine
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

module.exports = router;