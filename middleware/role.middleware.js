// middleware/role.middleware.js
const ApiResponse = require('../utils/apiResponse');
const { ROLES } = require('../config/constants');
const logger = require('../utils/logger');

/**
 * Middleware pour vérifier si l'utilisateur a le(s) rôle(s) requis
 * @param {...string} allowedRoles - Liste des rôles autorisés
 */
const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    // Vérifier si l'utilisateur est authentifié
    if (!req.user) {
      logger.warn(` Tentative d'accès sans authentification`);
      return ApiResponse.unauthorized(res, 'Authentification requise');
    }

    // Vérifier si l'utilisateur a un des rôles autorisés
    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(
        ` Accès refusé - User: ${req.user.email} (${req.user.role}) - Rôles requis: ${allowedRoles.join(', ')}`
      );
      return ApiResponse.forbidden(
        res,
        `Accès refusé. Rôle requis: ${allowedRoles.join(' ou ')}`
      );
    }

    logger.debug(`Autorisation accordée - User: ${req.user.email} (${req.user.role})`);
    next();
  };
};

/**
 * Middleware pour vérifier si l'utilisateur est Admin
 */
const isAdmin = checkRole(ROLES.ADMIN);

/**
 * Middleware pour vérifier si l'utilisateur est Admin ou Trésorier
 */
const isAdminOrTresorier = checkRole(ROLES.ADMIN, ROLES.TRESORIER);

/**
 * Middleware pour vérifier si l'utilisateur est Trésorier
 */
const isTresorier = checkRole(ROLES.TRESORIER);

/**
 * Middleware pour vérifier si l'utilisateur est Membre
 */
const isMembre = checkRole(ROLES.MEMBRE);

/**
 * Middleware pour vérifier si l'utilisateur accède à ses propres données
 * ou s'il est Admin
 */
const isSelfOrAdmin = (req, res, next) => {
  if (!req.user) {
    return ApiResponse.unauthorized(res, 'Authentification requise');
  }

  const targetUserId = req.params.userId || req.params.id;

  // Admin peut accéder à tout
  if (req.user.role === ROLES.ADMIN) {
    return next();
  }

  // Utilisateur peut accéder uniquement à ses propres données
  if (req.user._id.toString() === targetUserId) {
    return next();
  }

  logger.warn(
    ` Tentative d'accès aux données d'un autre utilisateur - User: ${req.user.email}`
  );
  return ApiResponse.forbidden(res, 'Vous ne pouvez accéder qu\'à vos propres données');
};

module.exports = {
  checkRole,
  isAdmin,
  isAdminOrTresorier,
  isTresorier,
  isMembre,
  isSelfOrAdmin,
};