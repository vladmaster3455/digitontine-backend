// middleware/errorHandler.middleware.js
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');
const { HTTP_STATUS } = require('../config/constants');

/**
 * Gestion des erreurs MongoDB de duplication
 */
const handleDuplicateKeyError = (err) => {
  const field = Object.keys(err.keyValue)[0];
  const value = err.keyValue[field];
  
  return {
    message: `La valeur "${value}" existe déjà pour le champ "${field}"`,
    statusCode: HTTP_STATUS.CONFLICT,
  };
};

/**
 * Gestion des erreurs de validation MongoDB
 */
const handleValidationError = (err) => {
  const errors = Object.values(err.errors).map(error => ({
    field: error.path,
    message: error.message,
  }));

  return {
    message: 'Erreur de validation',
    statusCode: HTTP_STATUS.UNPROCESSABLE_ENTITY,
    errors,
  };
};

/**
 * Gestion des erreurs CastError MongoDB (ID invalide)
 */
const handleCastError = (err) => {
  return {
    message: `Ressource non trouvée avec l'ID: ${err.value}`,
    statusCode: HTTP_STATUS.NOT_FOUND,
  };
};

/**
 * Middleware principal de gestion des erreurs
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.stack = err.stack;

  // Log l'erreur
  logger.error(`❌ Erreur - ${req.method} ${req.originalUrl}`, {
    message: err.message,
    stack: err.stack,
    user: req.user ? req.user.email : 'Non authentifié',
    ip: req.ip,
  });

  // Erreur de duplication MongoDB (code 11000)
  if (err.code === 11000) {
    const handled = handleDuplicateKeyError(err);
    return ApiResponse.error(res, handled.message, handled.statusCode);
  }

  // Erreur de validation MongoDB
  if (err.name === 'ValidationError') {
    const handled = handleValidationError(err);
    return ApiResponse.error(
      res,
      handled.message,
      handled.statusCode,
      handled.errors
    );
  }

  // Erreur CastError (ID MongoDB invalide)
  if (err.name === 'CastError') {
    const handled = handleCastError(err);
    return ApiResponse.error(res, handled.message, handled.statusCode);
  }

  // Erreur JWT
  if (err.name === 'JsonWebTokenError') {
    return ApiResponse.unauthorized(res, 'Token invalide');
  }

  if (err.name === 'TokenExpiredError') {
    return ApiResponse.unauthorized(res, 'Token expiré');
  }

  // Erreurs personnalisées (AppError)
  if (err instanceof AppError) {
    return ApiResponse.error(
      res,
      err.message,
      err.statusCode,
      err.errors || null
    );
  }

  // Erreur par défaut
  const statusCode = error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  const message = error.message || 'Erreur serveur';

  return ApiResponse.error(
    res,
    message,
    statusCode,
    process.env.NODE_ENV === 'development' ? { stack: error.stack } : null
  );
};

/**
 * Middleware pour gérer les routes non trouvées (404)
 */
const notFoundHandler = (req, res, next) => {
  logger.warn(`🔍 Route non trouvée: ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
  
  return ApiResponse.notFound(
    res,
    `Route non trouvée: ${req.method} ${req.originalUrl}`
  );
};

module.exports = {
  errorHandler,
  notFoundHandler,
};