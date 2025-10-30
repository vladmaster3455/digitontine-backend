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
 * Routes publiques (sans authentification JWT)
 * Ces routes ne nécessitent PAS de token car elles servent à créer le token
 */
const publicRoutes = [
  '/auth/login',
  '/auth/verify-login-otp',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email',
  '/auth/refresh-token'
];

/**
 * Middleware proxy : Ajoute la clé API à toutes les requêtes
 */
const proxyWithApiKey = async (req, res, next) => {
  try {
    // Logger la requête
    logger.info(`[PROXY] ${req.method} ${req.originalUrl}`);
    logger.info(`[PROXY] Body:`, JSON.stringify(req.body));
    
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

// Appliquer le middleware proxy à toutes les routes
router.use(proxyWithApiKey);

// Route proxy générique : forwarder TOUTES les requêtes avec la clé API
router.all('/*', conditionalAuth, async (req, res) => {
  try {
    const path = req.params[0] || '';
    const fullUrl = `${process.env.BASE_URL}/digitontine/${path}`;
    
    logger.info(`[PROXY] Forwardage vers: ${fullUrl}`);
    
    // Construire les headers proprement
    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.API_KEY,
    };
    
    // Ajouter le token JWT si présent (pour routes protégées)
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }
    
    // Préparer la config axios
    const axiosConfig = {
      method: req.method,
      url: fullUrl,
      headers: headers,
      validateStatus: () => true, // Accepter tous les statuts
    };
    
    // Ajouter query params si présents
    if (Object.keys(req.query).length > 0) {
      axiosConfig.params = req.query;
    }
    
    // Ajouter body si méthode POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      axiosConfig.data = req.body;
      logger.info(`[PROXY] Envoi data:`, JSON.stringify(req.body));
    }
    
    // Forwarder la requête
    logger.info(`[PROXY] Config axios:`, JSON.stringify({
      method: axiosConfig.method,
      url: axiosConfig.url,
      hasData: !!axiosConfig.data,
      headers: Object.keys(axiosConfig.headers)
    }));
    
    const response = await axios(axiosConfig);
    
    logger.info(`[PROXY] Réponse: ${response.status}`);
    
    // Retourner la réponse
    res.status(response.status).json(response.data);
    
  } catch (error) {
    logger.error('[PROXY] Erreur forwardage:', error.message);
    
    // Si erreur axios avec réponse
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    
    // Erreur réseau ou autre
    res.status(500).json({
      success: false,
      message: 'Erreur proxy',
      error: error.message
    });
  }
});

module.exports = router;