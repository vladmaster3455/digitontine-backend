// middleware/apiKey.middleware.js
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

/**
 * Middleware pour vérifier la clé API
 */
const verifyApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  // Récupérer les clés autorisées depuis .env
  const allowedKeys = process.env.ALLOWED_API_KEYS
    ? process.env.ALLOWED_API_KEYS.split(',').map(key => key.trim())
    : [];

  // Vérifier si une clé est fournie
  if (!apiKey) {
    logger.warn(` Tentative d'accès sans clé API - IP: ${req.ip}`);
    return ApiResponse.unauthorized(res, 'Clé API requise');
  }

  // Vérifier si la clé est valide
  if (!allowedKeys.includes(apiKey)) {
    logger.warn(` Clé API invalide: ${apiKey} - IP: ${req.ip}`);
    return ApiResponse.unauthorized(res, 'Clé API invalide');
  }

  // Clé valide
  logger.debug(`Clé API valide - IP: ${req.ip}`);
  next();
};

module.exports = verifyApiKey;