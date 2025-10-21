// middleware/validator.middleware.js
const { validationResult } = require('express-validator');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

/**
 * Middleware pour valider les résultats de express-validator
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.path || error.param,
      message: error.msg,
      value: error.value,
    }));

    logger.warn(`❌ Erreur de validation - ${req.method} ${req.originalUrl}`, {
      errors: formattedErrors,
      body: req.body,
    });

    return ApiResponse.validationError(res, formattedErrors);
  }

  next();
};

/**
 * Middleware pour valider un ID MongoDB
 */
const validateMongoId = (paramName = 'id') => {
  return (req, res, next) => {
    const id = req.params[paramName];

    if (!mongoose.Types.ObjectId.isValid(id)) {
      logger.warn(`❌ ID MongoDB invalide: ${id}`);
      return ApiResponse.error(res, `ID invalide: ${id}`, 400);
    }

    next();
  };
};

/**
 * Middleware pour valider plusieurs IDs MongoDB
 */
const validateMongoIds = (fieldName) => {
  return (req, res, next) => {
    const ids = req.body[fieldName];

    if (!Array.isArray(ids)) {
      return ApiResponse.error(res, `${fieldName} doit être un tableau`, 400);
    }

    const invalidIds = ids.filter(id => !mongoose.Types.ObjectId.isValid(id));

    if (invalidIds.length > 0) {
      logger.warn(`❌ IDs MongoDB invalides: ${invalidIds.join(', ')}`);
      return ApiResponse.error(
        res,
        `IDs invalides dans ${fieldName}: ${invalidIds.join(', ')}`,
        400
      );
    }

    next();
  };
};

/**
 * Middleware pour valider la pagination
 */
const validatePagination = (req, res, next) => {
  const { page, limit } = req.query;

  if (page && (isNaN(page) || parseInt(page) < 1)) {
    return ApiResponse.error(res, 'Le paramètre "page" doit être un nombre positif', 400);
  }

  if (limit && (isNaN(limit) || parseInt(limit) < 1 || parseInt(limit) > 100)) {
    return ApiResponse.error(
      res,
      'Le paramètre "limit" doit être entre 1 et 100',
      400
    );
  }

  next();
};

/**
 * Middleware pour nettoyer les données d'entrée (trim, lowercase pour email)
 */
const sanitizeInput = (req, res, next) => {
  if (req.body) {
    // Trim tous les strings
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].trim();
      }
    });

    // Lowercase pour email
    if (req.body.email) {
      req.body.email = req.body.email.toLowerCase();
    }
  }

  next();
};

module.exports = {
  validate,
  validateMongoId,
  validateMongoIds,
  validatePagination,
  sanitizeInput,
};