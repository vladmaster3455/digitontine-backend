// middleware/validator.middleware.js
const { validationResult } = require('express-validator');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

/**
 * Middleware pour valider les données avec express-validator
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.path || error.param,
      message: error.msg,
      value: error.value,
    }));

    logger.warn(` Erreur de validation - Endpoint: ${req.originalUrl}`, {
      errors: formattedErrors,
    });

    return ApiResponse.validationError(res, formattedErrors);
  }

  next();
};

/**
 * Middleware pour sanitizer les données MongoDB (prévention injection)
 */
const sanitizeMongoose = (req, res, next) => {
  // Supprimer les opérateurs MongoDB dangereux
  const sanitize = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;

    for (let key in obj) {
      if (key.startsWith('$') || key.startsWith('_')) {
        delete obj[key];
      } else if (typeof obj[key] === 'object') {
        sanitize(obj[key]);
      }
    }
    return obj;
  };

  if (req.body) req.body = sanitize(req.body);
  if (req.params) req.params = sanitize(req.params);
  if (req.query) req.query = sanitize(req.query);

  next();
};

/**
 * Middleware pour valider les IDs MongoDB
 */
const validateMongoId = (paramName = 'id') => {
  return (req, res, next) => {
    const mongoose = require('mongoose');
    const id = req.params[paramName];

    if (!mongoose.Types.ObjectId.isValid(id)) {
      logger.warn(`  ID MongoDB invalide: ${id}`);
      return ApiResponse.error(res, `ID invalide: ${id}`, 400);
    }

    next();
  };
};

module.exports = {
  validate,
  sanitizeMongoose,
  validateMongoId,
};