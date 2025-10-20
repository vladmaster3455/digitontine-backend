// routes/validation.routes.js
const express = require('express');
const router = express.Router();

const {
  createValidationRequest,
  confirmTresorierOTP,
  confirmAdminOTP,
  rejectValidationRequest,
  getPendingRequests,
  getMyRequests,
  getRequestDetails,
  resendOTP,
} = require('../controllers/validation.controller');

const {
  validateCreateRequest,
  validateConfirmTresorierOTP,
  validateConfirmAdminOTP,
  validateRejectRequest,
  validateResendOTP,
  validateListRequests,
  validateRequestId,
} = require('../validators/validation.validator');

const { validate } = require('../middleware/validator.middleware');
const { verifyToken } = require('../middleware/auth.middleware');
const { isAdmin, isTresorier, isAdminOrTresorier } = require('../middleware/role.middleware');
const {
  validateRequestExists,
  isTresorierInitiator,
  isAssignedAdmin,
  checkStatusAllowsAction,
  checkNotExpired,
  checkRemainingAttempts,
} = require('../middleware/doubleValidation.middleware');
const { auditLog } = require('../middleware/audit.middleware');

// ========================================
// ROUTES TRÉSORIER
// ========================================

/**
 * @route   POST /api/v1/validation/request
 * @desc    Créer une demande de validation
 * @access  Trésorier
 */
router.post(
  '/request',
  verifyToken,
  isTresorier,
  validateCreateRequest,
  validate,
  auditLog('CREATE_VALIDATION_REQUEST', 'ValidationRequest'),
  createValidationRequest
);

/**
 * @route   POST /api/v1/validation/confirm/tresorier/:validationRequestId
 * @desc    Confirmer OTP Trésorier
 * @access  Trésorier (initiateur)
 */
router.post(
  '/confirm/tresorier/:validationRequestId',
  verifyToken,
  isTresorier,
  validateConfirmTresorierOTP,
  validate,
  validateRequestExists,
  isTresorierInitiator,
  checkStatusAllowsAction(['pending']),
  checkNotExpired,
  checkRemainingAttempts('tresorier'),
  auditLog('CONFIRM_TRESORIER_OTP', 'ValidationRequest'),
  confirmTresorierOTP
);

/**
 * @route   GET /api/v1/validation/my-requests
 * @desc    Obtenir mes demandes de validation
 * @access  Trésorier
 */
router.get(
  '/my-requests',
  verifyToken,
  isTresorier,
  validateListRequests,
  validate,
  getMyRequests
);

// ========================================
// ROUTES ADMIN
// ========================================

/**
 * @route   POST /api/v1/validation/confirm/admin/:validationRequestId
 * @desc    Confirmer OTP Admin
 * @access  Admin (assigné)
 */
router.post(
  '/confirm/admin/:validationRequestId',
  verifyToken,
  isAdmin,
  validateConfirmAdminOTP,
  validate,
  validateRequestExists,
  isAssignedAdmin,
  checkStatusAllowsAction(['tresorier_validated']),
  checkNotExpired,
  checkRemainingAttempts('admin'),
  auditLog('CONFIRM_ADMIN_OTP', 'ValidationRequest'),
  confirmAdminOTP
);

/**
 * @route   POST /api/v1/validation/reject/:validationRequestId
 * @desc    Rejeter une demande de validation
 * @access  Admin
 */
router.post(
  '/reject/:validationRequestId',
  verifyToken,
  isAdmin,
  validateRejectRequest,
  validate,
  validateRequestExists,
  checkStatusAllowsAction(['pending', 'tresorier_validated']),
  auditLog('REJECT_VALIDATION_REQUEST', 'ValidationRequest'),
  rejectValidationRequest
);

/**
 * @route   GET /api/v1/validation/pending
 * @desc    Obtenir les demandes en attente
 * @access  Admin
 */
router.get(
  '/pending',
  verifyToken,
  isAdmin,
  getPendingRequests
);

// ========================================
// ROUTES COMMUNES (TRÉSORIER + ADMIN)
// ========================================

/**
 * @route   GET /api/v1/validation/:validationRequestId
 * @desc    Obtenir détails d'une demande
 * @access  Trésorier (initiateur) ou Admin (assigné)
 */
router.get(
  '/:validationRequestId',
  verifyToken,
  isAdminOrTresorier,
  validateRequestId,
  validate,
  validateRequestExists,
  getRequestDetails
);

/**
 * @route   POST /api/v1/validation/resend-otp/:validationRequestId
 * @desc    Renvoyer un code OTP
 * @access  Trésorier (pour son OTP) ou Admin (pour son OTP)
 */
router.post(
  '/resend-otp/:validationRequestId',
  verifyToken,
  isAdminOrTresorier,
  validateResendOTP,
  validate,
  validateRequestExists,
  checkNotExpired,
  resendOTP
);
/**
 * @swagger
 * /digitontine/validation/request:
 *   post:
 *     tags: [Validations]
 *     summary: Créer une demande de validation
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [actionType, resourceType, resourceId]
 *             properties:
 *               actionType: { type: string }
 *               resourceType: { type: string }
 *               resourceId: { type: string }
 *     responses:
 *       201:
 *         description: Demande créée
 */
module.exports = router;