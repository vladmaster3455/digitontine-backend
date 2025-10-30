// routes/proxy.routes.js
/**
 * Proxy pour ajouter automatiquement la clé API
 * Le client n'envoie PAS la clé, le serveur l'ajoute
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');
const { verifyToken } = require('../middleware/auth.middleware');

/**
 * Middleware proxy : Ajoute la clé API à toutes les requêtes
 */
const proxyWithApiKey = async (req, res, next) => {
  try {
    // Ajouter la clé API dans le header
    req.headers['X-API-Key'] = process.env.API_KEY;
    
    // Logger la requête
    logger.info(`[PROXY] ${req.method} ${req.originalUrl}`);
    
    next();
  } catch (error) {
    logger.error('[PROXY] Erreur:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erreur proxy',
      error: error.message
    });
  }
};

// Appliquer le middleware proxy à toutes les routes
router.use(proxyWithApiKey);

/**
 * Routes publiques (sans authentification JWT)
 * Ces routes ne nécessitent PAS de token car elles servent à créer le token
 */
const publicRoutes = [
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email'
];

/**
 * Middleware conditionnel : applique verifyToken sauf pour les routes publiques
 */
const conditionalAuth = (req, res, next) => {
  const path = req.params[0] || '';
  const isPublicRoute = publicRoutes.some(route => path.startsWith(route.substring(1)));
  
  if (isPublicRoute) {
    logger.info(`[PROXY] Route publique détectée: ${path} - authentification ignorée`);
    return next();
  }
  
  logger.info(`[PROXY] Route protégée: ${path} - authentification requise`);
  return verifyToken(req, res, next);
};

// Route proxy générique : forwarder TOUTES les requêtes avec la clé API
router.all('/*', conditionalAuth, async (req, res) => {
  try {
    const path = req.params[0] || '';
    const fullUrl = `${process.env.BASE_URL}/digitontine/${path}`;
    
    logger.info(`[PROXY] Forwardage vers: ${fullUrl}`);
    
    // Construire les headers
    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.API_KEY,
      ...req.headers
    };
    
    // Supprimer les headers problématiques
    delete headers.host;
    delete headers['content-length'];
    
    // Forwarder la requête
    const response = await axios({
      method: req.method,
      url: fullUrl,
      data: req.body,
      params: req.query,
      headers: headers,
      validateStatus: () => true // Accepter tous les statuts
    });
    
    // Retourner la réponse
    res.status(response.status).json(response.data);
    
  } catch (error) {
    logger.error('[PROXY] Erreur forwardage:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erreur proxy',
      error: error.message
    });
  }
});

module.exports = router;