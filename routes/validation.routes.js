// routes/validation.routes.js
const express = require('express');
const router = express.Router();

const {
  createValidationRequest,
  confirmTresorierOTP,
  rejectValidationRequest,
  getPendingRequests,
  getMyRequests,
  getRequestDetails,
  resendOTP,
} = require('../controllers/validation.controller');

const {
  validateCreateRequest,
  validateConfirmTresorierOTP,
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
  isTresorierAssigned,  // ✅ BON NOM
  checkStatusAllowsAction,
  checkNotExpired,
  checkRemainingAttempts,
} = require('../middleware/doubleValidation.middleware');
const { auditLog } = require('../middleware/audit.middleware');

/**
 * @route   POST /api/v1/validation/request
 * @desc    Créer une demande de validation (Admin initie)
 * @access  Admin
 */
router.post(
  '/request',
  verifyToken,
  isAdmin,
  validateCreateRequest,
  validate,
  auditLog('CREATE_VALIDATION_REQUEST', 'ValidationRequest'),
  createValidationRequest
);

/**
 * @route   POST /api/v1/validation/accept/:validationRequestId
 * @desc    Accepter une demande de validation
 * @access  Trésorier (assigné)
 */
router.post(
  '/accept/:validationRequestId',
  verifyToken,
  isTresorier,
  validateRequestExists,
  isTresorierAssigned,
  checkStatusAllowsAction(['pending']),
  auditLog('ACCEPT_VALIDATION_REQUEST', 'ValidationRequest'),
  acceptValidation //  Nouvelle fonction
);
/**
 * @route   GET /api/v1/validation/pending
 * @desc    Obtenir les demandes en attente (Trésorier)
 * @access  Trésorier
 */
router.get(
  '/pending',
  verifyToken,
  isTresorier,
  getPendingRequests
);

/**
 * @route   GET /api/v1/validation/my-requests
 * @desc    Obtenir mes demandes (Admin)
 * @access  Admin
 */
router.get(
  '/my-requests',
  verifyToken,
  isAdmin,
  validateListRequests,
  validate,
  getMyRequests
);

/**
 * @route   POST /api/v1/validation/reject/:validationRequestId
 * @desc    Rejeter une demande de validation
 * @access  Trésorier
 */
router.post(
  '/reject/:validationRequestId',
  verifyToken,
  isTresorier,
  validateRejectRequest,
  validate,
  validateRequestExists,
  checkStatusAllowsAction(['pending']),
  auditLog('REJECT_VALIDATION_REQUEST', 'ValidationRequest'),
  rejectValidationRequest
);

/**
 * @route   GET /api/v1/validation/:validationRequestId
 * @desc    Obtenir détails d'une demande
 * @access  Admin (initiateur) ou Trésorier (assigné)
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



module.exports = router;