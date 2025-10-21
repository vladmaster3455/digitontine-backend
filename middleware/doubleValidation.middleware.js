// middleware/doubleValidation.middleware.js
const ValidationRequest = require('../models/ValidationRequest');
const User = require('../models/User');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { ROLES } = require('../config/constants');

/**
 * Middleware pour vérifier si une action nécessite une double validation
 * À utiliser AVANT l'exécution de l'action sensible
 */
const requireDoubleValidation = (actionType) => {
  return async (req, res, next) => {
    try {
      const user = req.user;

      // ✅ Exception : Admin peut changer les rôles sans validation
      if (actionType === 'CHANGE_ROLE' && user.role === ROLES.ADMIN) {
        logger.info(`🔓 Admin ${user.email} change un rôle SANS validation`);
        return next();
      }

      // ✅ Si c'est un Admin qui fait l'action directement (pas un Trésorier)
      if (user.role === ROLES.ADMIN) {
        // Admin peut tout faire SAUF les actions sensibles listées
        const actionsNecessitantValidation = [
          'DELETE_USER',
          'DELETE_TONTINE',
          'BLOCK_TONTINE',
          'UNBLOCK_TONTINE',
          'ACTIVATE_USER',
          'DEACTIVATE_USER',
        ];

        if (!actionsNecessitantValidation.includes(actionType)) {
          return next(); // Action normale, pas besoin de validation
        }

        // Si Admin fait une action sensible, on vérifie s'il y a une ValidationRequest
        const validationRequestId = req.body.validationRequestId || req.query.validationRequestId;

        if (!validationRequestId) {
          return ApiResponse.error(
            res,
            'Cette action nécessite une demande de validation. Utilisez l\'endpoint /api/v1/validation/request',
            400
          );
        }

        // Vérifier que la ValidationRequest est complète
        const validationRequest = await ValidationRequest.findById(validationRequestId);

        if (!validationRequest) {
          return ApiResponse.notFound(res, 'Demande de validation introuvable');
        }

        if (validationRequest.status !== 'completed') {
          return ApiResponse.error(
            res,
            `La validation n'est pas complète. Statut actuel : ${validationRequest.status}`,
            403
          );
        }

        // ✅ Validation complète, autoriser l'action
        req.validationRequest = validationRequest;
        logger.info(`✅ Action ${actionType} autorisée avec validation complète`);
        return next();
      }

      // ❌ Si c'est un Trésorier, il doit obligatoirement passer par ValidationRequest
      if (user.role === ROLES.TRESORIER) {
        return ApiResponse.forbidden(
          res,
          'En tant que Trésorier, vous devez créer une demande de validation via /api/v1/validation/request'
        );
      }

      // ❌ Membres ne peuvent pas faire ces actions
      return ApiResponse.forbidden(res, 'Vous n\'avez pas les permissions nécessaires');
    } catch (error) {
      logger.error('❌ Erreur middleware doubleValidation:', error);
      return ApiResponse.serverError(res, 'Erreur lors de la vérification de validation');
    }
  };
};

/**
 * Middleware pour vérifier qu'une ValidationRequest existe et est valide
 */
const validateRequestExists = async (req, res, next) => {
  try {
    const { validationRequestId } = req.params;

    const validationRequest = await ValidationRequest.findById(validationRequestId)
      .populate('initiatedBy', 'prenom nom email role')
      .populate('assignedTresorier', 'prenom nom email')
      .populate('resourceId');

    if (!validationRequest) {
      return ApiResponse.notFound(res, 'Demande de validation introuvable');
    }

    req.validationRequest = validationRequest;
    next();
  } catch (error) {
    logger.error('❌ Erreur validateRequestExists:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * Middleware pour vérifier que l'utilisateur est le Trésorier initiateur
 */
const isTresorierInitiator = (req, res, next) => {
  const { validationRequest, user } = req;

  if (validationRequest.initiatedBy._id.toString() !== user._id.toString()) {
    return ApiResponse.forbidden(res, 'Seul le Trésorier initiateur peut valider ce code');
  }

  next();
};

/**
 * Middleware pour vérifier que l'utilisateur est le Trésorier assigné
 * ✅ FONCTION AJOUTÉE POUR LA LOGIQUE CORRECTE
 */
const isTresorierAssigned = (req, res, next) => {
  const { validationRequest, user } = req;

  if (!validationRequest.assignedTresorier) {
    return ApiResponse.error(res, 'Aucun Trésorier assigné à cette demande', 400);
  }

  // Vérifier si l'objet est déjà populé ou non
  const tresorierAssignedId = validationRequest.assignedTresorier._id 
    ? validationRequest.assignedTresorier._id.toString() 
    : validationRequest.assignedTresorier.toString();

  if (tresorierAssignedId !== user._id.toString()) {
    return ApiResponse.forbidden(res, 'Seul le Trésorier assigné peut valider ce code');
  }

  next();
};

/**
 * Middleware pour vérifier que l'utilisateur est l'Admin assigné
 */
const isAssignedAdmin = (req, res, next) => {
  const { validationRequest, user } = req;

  if (!validationRequest.assignedAdmin) {
    return ApiResponse.error(res, 'Aucun Admin assigné à cette demande', 400);
  }

  if (validationRequest.assignedAdmin._id.toString() !== user._id.toString()) {
    return ApiResponse.forbidden(res, 'Seul l\'Admin assigné peut valider ce code');
  }

  next();
};

/**
 * Middleware pour vérifier que le statut permet une action
 */
const checkStatusAllowsAction = (allowedStatuses) => {
  return (req, res, next) => {
    const { validationRequest } = req;

    if (!allowedStatuses.includes(validationRequest.status)) {
      return ApiResponse.error(
        res,
        `Action impossible. Statut actuel : ${validationRequest.status}`,
        400
      );
    }

    next();
  };
};

/**
 * Middleware pour vérifier que les codes ne sont pas expirés
 */
const checkNotExpired = (req, res, next) => {
  const { validationRequest } = req;

  const now = Date.now();

  // Vérifier expiration OTP Trésorier
  if (validationRequest.tresorierOTP.codeExpiry && now > validationRequest.tresorierOTP.codeExpiry) {
    validationRequest.markAsExpired();
    validationRequest.save();
    return ApiResponse.error(res, 'Le code Trésorier a expiré', 400);
  }

  next();
};

/**
 * Middleware pour limiter les tentatives
 */
const checkRemainingAttempts = (otpType) => {
  return (req, res, next) => {
    const { validationRequest } = req;

    const otp = validationRequest.tresorierOTP;

    if (otp.attempts >= 3) {
      return ApiResponse.error(
        res,
        'Nombre maximum de tentatives atteint. La demande a été bloquée.',
        429
      );
    }

    next();
  };
};

/**
 * Nettoyer automatiquement les demandes expirées (à exécuter périodiquement)
 */
const cleanupExpiredRequests = async () => {
  try {
    const cleaned = await ValidationRequest.cleanupExpired();
    if (cleaned > 0) {
      logger.info(`🧹 ${cleaned} demandes de validation expirées nettoyées`);
    }
  } catch (error) {
    logger.error('❌ Erreur nettoyage demandes expirées:', error);
  }
};

module.exports = {
  requireDoubleValidation,
  validateRequestExists,
  isTresorierInitiator,
  isTresorierAssigned,  // ✅ FONCTION AJOUTÉE
  isAssignedAdmin,
  checkStatusAllowsAction,
  checkNotExpired,
  checkRemainingAttempts,
  cleanupExpiredRequests,
};