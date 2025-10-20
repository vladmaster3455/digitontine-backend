// utils/errors.js
const { HTTP_STATUS } = require('../config/constants');

/**
 * Classe de base pour les erreurs personnalisées
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Erreur de validation (422)
 */
class ValidationError extends AppError {
  constructor(message = 'Erreur de validation', errors = null) {
    super(message, HTTP_STATUS.UNPROCESSABLE_ENTITY);
    this.errors = errors;
  }
}

/**
 * Erreur d'authentification (401)
 */
class UnauthorizedError extends AppError {
  constructor(message = 'Accès non autorisé') {
    super(message, HTTP_STATUS.UNAUTHORIZED);
  }
}

/**
 * Erreur de permission (403)
 */
class ForbiddenError extends AppError {
  constructor(message = 'Accès interdit') {
    super(message, HTTP_STATUS.FORBIDDEN);
  }
}

/**
 * Ressource non trouvée (404)
 */
class NotFoundError extends AppError {
  constructor(message = 'Ressource non trouvée') {
    super(message, HTTP_STATUS.NOT_FOUND);
  }
}

/**
 * Conflit (409)
 */
class ConflictError extends AppError {
  constructor(message = 'Conflit détecté') {
    super(message, HTTP_STATUS.CONFLICT);
  }
}

/**
 * Erreur métier
 */
class BusinessError extends AppError {
  constructor(message, statusCode = HTTP_STATUS.BAD_REQUEST) {
    super(message, statusCode);
  }
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  BusinessError,
};