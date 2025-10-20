// middleware/rateLimit.middleware.js
const rateLimit = require('express-rate-limit');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { RATE_LIMIT } = require('../config/constants');

/**
 * Handler personnalisé pour les dépassements de limite
 */
const rateLimitHandler = (req, res) => {
  logger.warn(`Rate limit dépassé - IP: ${req.ip} - Endpoint: ${req.originalUrl}`);
  
  return ApiResponse.error(
    res,
    'Trop de requêtes. Veuillez réessayer dans quelques minutes.',
    429
  );
};

/**
 * Rate limiter général pour toutes les routes API
 */
const generalLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS, // 15 minutes par défaut
  max: RATE_LIMIT.MAX_REQUESTS, // 100 requêtes par défaut
  message: 'Trop de requêtes depuis cette IP',
  handler: rateLimitHandler,
  standardHeaders: true, // Retourne les headers RateLimit-*
  legacyHeaders: false, // Désactive les headers X-RateLimit-*
  skip: (req) => {
    // Bypass pour les IPs de confiance (optionnel)
    const trustedIPs = process.env.TRUSTED_IPS 
      ? process.env.TRUSTED_IPS.split(',')
      : [];
    return trustedIPs.includes(req.ip);
  },
});

/**
 * Rate limiter strict pour les tentatives de connexion
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: RATE_LIMIT.LOGIN_MAX, // 5 tentatives par défaut
  message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.',
  handler: (req, res) => {
    logger.warn(
      ` Tentatives de connexion excessives - IP: ${req.ip} - Email: ${req.body.email || 'N/A'}`
    );
    return ApiResponse.error(
      res,
      'Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes.',
      429
    );
  },
  skipSuccessfulRequests: true, // Ne compte pas les connexions réussies
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter pour les endpoints sensibles (création compte, reset password)
 */
const sensitiveActionsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 10, // 10 tentatives par heure
  message: 'Trop de tentatives. Réessayez plus tard.',
  handler: rateLimitHandler,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter pour les webhooks
 */
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requêtes par minute
  message: 'Trop de requêtes webhook',
  handler: rateLimitHandler,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter pour les API keys (plus généreux)
 */
const apiKeyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requêtes
  keyGenerator: (req) => {
    // Utiliser l'API key comme clé de limitation
    return req.headers['x-api-key'] || req.ip;
  },
  handler: rateLimitHandler,
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  generalLimiter,
  loginLimiter,
  sensitiveActionsLimiter,
  webhookLimiter,
  apiKeyLimiter,
};