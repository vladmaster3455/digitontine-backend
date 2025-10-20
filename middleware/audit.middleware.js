// middleware/audit.middleware.js
const logger = require('../utils/logger');

/**
 * Middleware pour logger automatiquement les actions sensibles
 * Note: Nécessite que le modèle AuditLog soit créé
 */
const auditLog = (action, resource) => {
  return async (req, res, next) => {
    // Sauvegarder la fonction json originale
    const originalJson = res.json;
    let responseData = null;
    let statusCode = null;

    // Override res.json pour capturer la réponse
    res.json = function (data) {
      responseData = data;
      statusCode = res.statusCode;
      res.json = originalJson;
      return originalJson.call(this, data);
    };

    // Intercepter la fin de la réponse
    res.on('finish', async () => {
      try {
        // Logger uniquement les actions réussies (2xx)
        if (statusCode >= 200 && statusCode < 300) {
          const auditData = {
            userId: req.user ? req.user._id : null,
            userEmail: req.user ? req.user.email : 'Système',
            action,
            resource,
            resourceId: req.params.id || req.params.userId || req.params.tontineId || null,
            details: {
              method: req.method,
              url: req.originalUrl,
              ip: req.ip,
              userAgent: req.get('user-agent'),
              body: sanitizeBody(req.body),
              params: req.params,
              query: req.query,
            },
            statusCode,
            timestamp: new Date(),
          };

          // Sauvegarder dans la base de données
          // Note: Le modèle AuditLog doit être importé après sa création
          try {
            const AuditLog = require('../models/AuditLog');
            await AuditLog.create(auditData);
          } catch (modelError) {
            // Si le modèle n'existe pas encore, logger uniquement dans Winston
            logger.debug(' Modèle AuditLog pas encore créé, log Winston uniquement');
          }

          // Logger aussi dans Winston
          logger.info(` AUDIT: ${action} on ${resource}`, {
            user: auditData.userEmail,
            resourceId: auditData.resourceId,
          });
        }
      } catch (error) {
        // Ne pas bloquer la requête si l'audit échoue
        logger.error(' Erreur lors de l\'audit logging:', error);
      }
    });

    next();
  };
};

/**
 * Fonction pour masquer les données sensibles dans les logs
 */
const sanitizeBody = (body) => {
  if (!body) return {};

  const sanitized = { ...body };

  // Masquer les mots de passe
  if (sanitized.motDePasse) sanitized.motDePasse = '***HIDDEN***';
  if (sanitized.password) sanitized.password = '***HIDDEN***';
  if (sanitized.nouveauMotDePasse) sanitized.nouveauMotDePasse = '***HIDDEN***';
  if (sanitized.ancienMotDePasse) sanitized.ancienMotDePasse = '***HIDDEN***';

  // Masquer les tokens
  if (sanitized.token) sanitized.token = '***HIDDEN***';
  if (sanitized.resetToken) sanitized.resetToken = '***HIDDEN***';

  // Masquer les données bancaires
  if (sanitized.cardNumber) sanitized.cardNumber = '***HIDDEN***';
  if (sanitized.cvv) sanitized.cvv = '***HIDDEN***';

  return sanitized;
};

/**
 * Fonction utilitaire pour créer manuellement un log d'audit
 */
const createAuditLog = async (data) => {
  try {
    const AuditLog = require('../models/AuditLog');
    await AuditLog.create(data);
    logger.info(` AUDIT: ${data.action} on ${data.resource}`, {
      user: data.userEmail,
    });
  } catch (error) {
    logger.error(' Erreur création audit log:', error);
  }
};

module.exports = {
  auditLog,
  createAuditLog,
  sanitizeBody,
};