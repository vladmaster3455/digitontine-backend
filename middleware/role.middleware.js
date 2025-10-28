// middleware/role.middleware.js
const ApiResponse = require('../utils/apiResponse');
const { ROLES } = require('../config/constants');
const logger = require('../utils/logger');

/**
 *  Fonction pour normaliser les rôles (accepter "Admin" et "Administrateur")
 * @param {string} role - Rôle à normaliser
 * @returns {string} - Rôle normalisé
 */
const normalizeRole = (role) => {
  if (role === 'Admin') return 'Administrateur';
  return role;
};

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

    //  CORRECTION : Normaliser le rôle de l'utilisateur
    const userRole = normalizeRole(req.user.role);
    
    //  Normaliser les rôles autorisés
    const normalizedAllowedRoles = allowedRoles.map(normalizeRole);

    // Vérifier si l'utilisateur a un des rôles autorisés
    if (!normalizedAllowedRoles.includes(userRole)) {
      logger.warn(
        ` Accès refusé - Utilisateur: ${req.user.email} (${req.user.role}) - Rôles requis: ${allowedRoles.join(', ')}`
      );
      return ApiResponse.forbidden(
        res,
        `Accès refusé. Rôle requis: ${allowedRoles.join(' ou ')}`
      );
    }

    logger.debug(` Autorisation accordée - Utilisateur: ${req.user.email} (${req.user.role})`);
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

  //  CORRECTION : Normaliser le rôle avant la vérification
  const userRole = normalizeRole(req.user.role);

  // Admin peut accéder à tout
  if (userRole === ROLES.ADMIN) {
    return next();
  }

  // Utilisateur peut accéder uniquement à ses propres données
  if (req.user._id.toString() === targetUserId) {
    return next();
  }

  logger.warn(
    ` Tentative d'accès aux données d'un autre utilisateur - Utilisateur: ${req.user.email}`
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
  normalizeRole, //  Exporter pour réutilisation si nécessaire
};