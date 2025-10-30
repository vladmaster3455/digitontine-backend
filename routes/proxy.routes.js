// routes/proxy.routes.js
/**
 * Proxy pour ajouter automatiquement la clé API
 *  FIXÉ: Évite la boucle infinie en forwardant vers localhost en local
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const FormData = require('form-data');
const multer = require('multer');
const logger = require('../utils/logger');
const { verifyToken } = require('../middleware/auth.middleware');

// Configuration Multer pour gérer les fichiers en mémoire
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
});

const parseMultipart = upload.any();

/**
 * Routes publiques (sans authentification JWT)
 */
const publicRoutes = [
  '/auth/login',
  '/auth/verify-login-otp',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/confirm-password-change',
  '/auth/verify-email',
  '/auth/refresh-token',
  '/transactions/webhook/wave'
];

/**
 * 🔧 FONCTION: Déterminer l'URL interne pour forwarder
 * En développement: localhost:5000
 * En production: toujours localhost (car même serveur)
 */
const getInternalApiUrl = () => {
  // En production ET développement: forwarder vers localhost
  // Car le proxy et l'API sont sur le MÊME serveur
  const port = process.env.PORT || 5000;
  return `http://localhost:${port}`;
};

/**
 * Middleware proxy : Ajoute la clé API à toutes les requêtes
 */
const proxyWithApiKey = async (req, res, next) => {
  try {
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

/**
 * Middleware conditionnel : applique verifyToken sauf pour les routes publiques
 */
const conditionalAuth = (req, res, next) => {
  const path = req.params[0] || '';
  
  const isPublicRoute = publicRoutes.some(route => {
    const routePath = route.substring(1);
    return path === routePath || path.startsWith(routePath + '/');
  });
  
  if (isPublicRoute) {
    logger.info(`[PROXY] Route publique: ${path} - authentification ignorée`);
    return next();
  }
  
  logger.info(`[PROXY] Route protégée: ${path} - authentification requise`);
  return verifyToken(req, res, next);
};

router.use(proxyWithApiKey);

// Middleware pour parser multipart AVANT conditionalAuth
router.use((req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  
  if (contentType.includes('multipart/form-data')) {
    logger.info('[PROXY]  Parsing multipart/form-data avec Multer');
    return parseMultipart(req, res, next);
  }
  
  next();
});

// ========================================
// ROUTE PROXY PRINCIPALE
// ========================================
router.all('/*', conditionalAuth, async (req, res) => {
  try {
    const path = req.params[0] || '';
    
    //  FIXÉ: Utiliser localhost au lieu de BASE_URL
    const internalUrl = getInternalApiUrl();
    const fullUrl = `${internalUrl}/digitontine/${path}`;
    
    logger.info(`[PROXY] → Forwardage vers: ${fullUrl}`);
    
    // Construire les headers
    const headers = {
      'X-API-Key': process.env.API_KEY,
      'X-Forwarded-For': req.ip, // Transmettre l'IP du client
    };
    
    // Ajouter le token JWT si présent
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
      logger.info(`[PROXY] → Token JWT transmis`);
    }
    
    const axiosConfig = {
      method: req.method,
      url: fullUrl,
      headers: headers,
      validateStatus: () => true, // Ne pas lever d'erreur sur les codes d'erreur HTTP
    };
    
    // Ajouter query params
    if (Object.keys(req.query).length > 0) {
      axiosConfig.params = req.query;
    }
    
    // GESTION MULTIPART/FORM-DATA
    const contentType = req.headers['content-type'] || '';
    
    if (contentType.includes('multipart/form-data')) {
      logger.info(`[PROXY]  Détection multipart/form-data - forwarding RAW`);
      
      const formData = new FormData();
      
      // Ajouter les champs texte
      if (req.body) {
        Object.keys(req.body).forEach(key => {
          if (req.body[key] !== undefined && req.body[key] !== null) {
            formData.append(key, req.body[key]);
            logger.debug(`[PROXY] Field: ${key} = ${req.body[key]}`);
          }
        });
      }
      
      // Ajouter les fichiers
      if (req.files) {
        Object.keys(req.files).forEach(fieldName => {
          const files = req.files[fieldName];
          files.forEach(file => {
            formData.append(fieldName, file.buffer, {
              filename: file.originalname,
              contentType: file.mimetype
            });
            logger.info(`[PROXY]  File: ${fieldName} = ${file.originalname}`);
          });
        });
      } else if (req.file) {
        formData.append(req.file.fieldname, req.file.buffer, {
          filename: req.file.originalname,
          contentType: req.file.mimetype
        });
        logger.info(`[PROXY]  File: ${req.file.fieldname} = ${req.file.originalname}`);
      }
      
      axiosConfig.data = formData;
      Object.assign(axiosConfig.headers, formData.getHeaders());
      
    } else if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      axiosConfig.headers['Content-Type'] = 'application/json';
      
      if (req.body && Object.keys(req.body).length > 0) {
        axiosConfig.data = req.body;
        logger.debug(`[PROXY] → Body JSON envoyé`);
      }
    }
    
    // Forwarder la requête
    const response = await axios(axiosConfig);
    
    logger.info(`[PROXY] ← Réponse: ${response.status}`);
    
    // Retourner la réponse au client
    res.status(response.status).json(response.data);
    
  } catch (error) {
    logger.error('[PROXY]  Erreur forwardage:', error.message);
    
    if (error.response) {
      logger.error(`[PROXY] Statut: ${error.response.status}`);
      return res.status(error.response.status).json(error.response.data);
    }
    
    res.status(500).json({
      success: false,
      message: 'Erreur proxy',
      error: error.message
    });
  }
});

module.exports = router;