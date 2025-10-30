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
 * OU sont accessibles sans connexion
 */
const publicRoutes = [
  // Auth - Connexion
  '/auth/login',
  '/auth/verify-login-otp',
  
  // Auth - Inscription (si vous l'ajoutez plus tard)
  '/auth/register',
  
  // Auth - Récupération mot de passe
  '/auth/forgot-password',
  '/auth/reset-password',
  
  // Auth - Confirmation changement mot de passe
  '/auth/confirm-password-change',
  
  // Auth - Vérification email (si nécessaire)
  '/auth/verify-email',
  
  // Auth - Refresh token (si vous l'implémentez)
  '/auth/refresh-token',
  
  // Webhook paiements (si nécessaire)
  '/transactions/webhook/wave'
];

/**
 * Middleware proxy : Ajoute la clé API à toutes les requêtes
 */
const proxyWithApiKey = async (req, res, next) => {
  try {
    // Logger la requête
    logger.info(`[PROXY] ${req.method} ${req.originalUrl}`);
    if (req.body && Object.keys(req.body).length > 0) {
      logger.info(`[PROXY] Body:`, JSON.stringify(req.body));
    }
    
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
  
  // Vérifier si la route est publique
  const isPublicRoute = publicRoutes.some(route => {
    const routePath = route.substring(1); // Enlever le '/' initial
    return path === routePath || path.startsWith(routePath + '/');
  });
  
  if (isPublicRoute) {
    logger.info(`[PROXY] Route publique: ${path} - authentification ignorée`);
    return next();
  }
  
  logger.info(`[PROXY]  Route protégée: ${path} - authentification requise`);
  return verifyToken(req, res, next);
};

// Appliquer le middleware proxy à toutes les routes
router.use(proxyWithApiKey);

// Route proxy générique : forwarder TOUTES les requêtes avec la clé API
router.all('/*', conditionalAuth, async (req, res) => {
  try {
    const path = req.params[0] || '';
    const fullUrl = `${process.env.BASE_URL}/digitontine/${path}`;
     console.log('=== DEBUG PROXY ===');
    console.log('req.body:', req.body);
    console.log('req.body type:', typeof req.body);
    console.log('req.body keys:', Object.keys(req.body || {}));
    console.log('req.headers content-type:', req.headers['content-type']);
    console.log('==================');
    
    logger.info(`[PROXY] → Forwardage vers: ${fullUrl}`);
    
 
    
    // Construire les headers proprement
    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.API_KEY,
    };
    
    // Ajouter le token JWT si présent (pour routes protégées)
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
      logger.info(`[PROXY] → Token JWT transmis`);
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
      logger.info(`[PROXY] → Query params:`, req.query);
    }
    
    // Ajouter body si méthode POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      axiosConfig.data = req.body;
      logger.info(`[PROXY] → Body envoyé:`, JSON.stringify(req.body));
    }
    
    // Forwarder la requête
    const response = await axios(axiosConfig);
    
    logger.info(`[PROXY] ← Réponse: ${response.status}`);
    
    // Retourner la réponse
    res.status(response.status).json(response.data);
    
  } catch (error) {
    logger.error('[PROXY]  Erreur forwardage:', error.message);
    
    // Si erreur axios avec réponse
    if (error.response) {
      logger.error(`[PROXY]  Statut: ${error.response.status}`);
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