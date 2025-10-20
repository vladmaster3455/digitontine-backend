// middleware/auth.middleware.js
const jwt = require('jsonwebtoken');
const ApiResponse = require('../utils/apiResponse');
const { UnauthorizedError } = require('../utils/errors');
const logger = require('../utils/logger');
const User = require('../models/User');

/**
 * Middleware pour vérifier le token JWT
 */
const verifyToken = async (req, res, next) => {
  try {
    // Récupérer le token depuis le header Authorization
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn(` Tentative d'accès sans token - IP: ${req.ip}`);
      return ApiResponse.unauthorized(res, 'Token d\'authentification requis');
    }

    const token = authHeader.split(' ')[1];

    // Vérifier le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Vérifier si l'utilisateur existe toujours
    const user = await User.findById(decoded.userId).select('-motDePasse');

    if (!user) {
      logger.warn(` Token valide mais utilisateur inexistant - UserID: ${decoded.userId}`);
      return ApiResponse.unauthorized(res, 'Utilisateur non trouvé');
    }

    // Vérifier si le compte est actif
    if (!user.isActive) {
      logger.warn(` Tentative d'accès avec compte désactivé - UserID: ${user._id}`);
      return ApiResponse.forbidden(res, 'Compte désactivé. Contactez l\'administrateur');
    }

    // Ajouter l'utilisateur à la requête
    req.user = user;
    req.userId = user._id;
    req.userRole = user.role;

    logger.debug(`Authentification réussie - User: ${user.email} (${user.role})`);
    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      logger.warn(` Token JWT invalide - IP: ${req.ip}`);
      return ApiResponse.unauthorized(res, 'Token invalide');
    }

    if (error.name === 'TokenExpiredError') {
      logger.warn(` Token JWT expiré - IP: ${req.ip}`);
      return ApiResponse.unauthorized(res, 'Token expiré. Veuillez vous reconnecter');
    }

    logger.error('Erreur vérification token:', error);
    return ApiResponse.serverError(res, 'Erreur lors de l\'authentification');
  }
};

/**
 * Middleware optionnel - Vérifie le token s'il existe mais ne bloque pas
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-motDePasse');

      if (user && user.isActive) {
        req.user = user;
        req.userId = user._id;
        req.userRole = user.role;
      }
    }

    next();
  } catch (error) {
    // En cas d'erreur, on continue sans utilisateur authentifié
    next();
  }
};

module.exports = {
  verifyToken,
  optionalAuth,
};