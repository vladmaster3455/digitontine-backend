// server.js - Version complète avec middleware requirePasswordChange
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');
const morgan = require('morgan');

// Config & Utils
const connectDB = require('./config/database');
const { APP } = require('./config/constants');
const logger = require('./utils/logger');
const ApiResponse = require('./utils/apiResponse');

// Middleware
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler.middleware');
const verifyApiKey = require('./middleware/apiKey.middleware');


// Swagger
const { swaggerSpec, swaggerUi, swaggerUiOptions } = require('./config/swagger');

// Routes
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const tontineRoutes = require('./routes/tontine.routes');
const transactionRoutes = require('./routes/transaction.routes');
const tirageRoutes = require('./routes/tirage.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const validationRoutes = require('./routes/validation.routes');

// Controller pour route publique admin
const { createAdmin } = require('./controllers/auth.controller');

// ========================================
// INITIALISATION APP
// ========================================
const app = express();

// ========================================
// CONNEXION BASE DE DONNEES
// ========================================
connectDB();

// ========================================
// MIDDLEWARE DE SECURITE
// ========================================

// Helmet - Securise les headers HTTP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS - Gestion des origines autorisees
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',') 
  : ['http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Autoriser les requetes sans origine (Postman, curl, Swagger UI meme origine)
    if (!origin) return callback(null, true);
    
    // Autoriser les origines dans la liste
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Autoriser localhost sur tous les ports (pour developpement)
    if (process.env.NODE_ENV === 'development' && origin.startsWith('http://localhost')) {
      return callback(null, true);
    }
    
    // Refuser les autres origines
    logger.warn(`Origine CORS refusee: ${origin}`);
    callback(new Error('Non autorise par CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));

// Sanitize donnees MongoDB
app.use(mongoSanitize());

// Compression des reponses
app.use(compression());

// ========================================
// MIDDLEWARE PARSING & LOGGING
// ========================================

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging HTTP
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  }));
}

// ========================================
// ROUTES PUBLIQUES (SANS CLE API)
// ========================================

/**
 * @swagger
 * /test:
 *   get:
 *     summary: Test de sante de l'API
 *     tags: [System]
 *     description: Verifier que l'API est en ligne et fonctionnelle
 *     responses:
 *       200:
 *         description: API operationnelle
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "DigiTontine API est en ligne"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 environment:
 *                   type: string
 *                   example: "development"
 *                 version:
 *                   type: string
 *                   example: "v1"
 */
app.get('/test', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'DigiTontine API est en ligne',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: APP.VERSION,
  });
});

/**
 * @swagger
 * /:
 *   get:
 *     summary: Page d'accueil de l'API
 *     tags: [System]
 *     description: Informations generales et liste des endpoints disponibles
 *     responses:
 *       200:
 *         description: Informations API
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Bienvenue sur DigiTontine API"
 *                 version:
 *                   type: string
 *                   example: "v1"
 *                 documentation:
 *                   type: string
 *                   example: "http://localhost:5000/api-docs"
 *                 endpoints:
 *                   type: object
 *                   properties:
 *                     test:
 *                       type: string
 *                       example: "/test"
 *                     createAdmin:
 *                       type: string
 *                       example: "/create-admin-public"
 *                     auth:
 *                       type: string
 *                       example: "/digitontine/auth"
 *                     users:
 *                       type: string
 *                       example: "/digitontine/users"
 */
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: `Bienvenue sur ${APP.NAME} API`,
    description: APP.DESCRIPTION,
    version: APP.VERSION,
    documentation: `${process.env.BASE_URL}/api-docs`,
    endpoints: {
      test: '/test',
      createAdmin: '/create-admin-public',
      auth: '/digitontine/auth',
      users: '/digitontine/users',
      tontines: '/digitontine/tontines',
      transactions: '/digitontine/transactions',
      tirages: '/digitontine/tirages',
      dashboard: '/digitontine/dashboard',
      validations: '/digitontine/validations',
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /api-docs:
 *   get:
 *     summary: Documentation Swagger UI
 *     tags: [System]
 *     description: Interface interactive de documentation de l'API
 *     responses:
 *       200:
 *         description: Page de documentation Swagger
 */
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));

/**
 * @swagger
 * /create-admin-public:
 *   post:
 *     summary: Creer un compte Administrateur (Route publique)
 *     tags: [System]
 *     description: |
 *       Route publique pour creer le premier administrateur.
 *       A desactiver en production pour des raisons de securite.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prenom
 *               - nom
 *               - email
 *               - numeroTelephone
 *               - motDePasse
 *             properties:
 *               prenom:
 *                 type: string
 *                 example: "Super"
 *               nom:
 *                 type: string
 *                 example: "Admin"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "admin@digitontine.com"
 *               numeroTelephone:
 *                 type: string
 *                 example: "+221771234567"
 *               motDePasse:
 *                 type: string
 *                 format: password
 *                 example: "Admin@2025!ChangeMe"
 *     responses:
 *       201:
 *         description: Administrateur cree avec succes
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         user:
 *                           $ref: '#/components/schemas/User'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       409:
 *         description: Email ou telephone deja utilise
 */
app.post('/create-admin-public', createAdmin);

// ========================================
// MIDDLEWARE POUR ROUTES PROTEGEES
// ========================================
const API_PREFIX = '/digitontine';

// 1. Verification de la cle API sur toutes les routes /digitontine/*
app.use(API_PREFIX, verifyApiKey);

// ========================================
// ROUTES API (PROTEGEES PAR CLE API)
// ========================================

// Route AUTH (sans verification de changement de mot de passe)
// Car elle contient /auth/first-password-change
app.use(`${API_PREFIX}/auth`, authRoutes);



// 3. Montage des routes protegees
app.use(`${API_PREFIX}/users`, userRoutes);
app.use(`${API_PREFIX}/tontines`, tontineRoutes);
app.use(`${API_PREFIX}/transactions`, transactionRoutes);
app.use(`${API_PREFIX}/tirages`, tirageRoutes);
app.use(`${API_PREFIX}/dashboard`, dashboardRoutes);
app.use(`${API_PREFIX}/validations`, validationRoutes);

// ========================================
// GESTION DES ERREURS
// ========================================

// 404 - Route non trouvee
app.use(notFoundHandler);

// Gestionnaire d'erreurs global
app.use(errorHandler);

// Gestionnaire d'erreurs final (fallback)
app.use((err, req, res, next) => {
  logger.error('Erreur non geree:', err);
  return ApiResponse.serverError(res, err.message);
});

// ========================================
// DEMARRAGE SERVEUR
// ========================================
const PORT = process.env.PORT || APP.PORT || 5000;

const server = app.listen(PORT, () => {
  logger.info('========================================');
  logger.info(`${APP.NAME} API demarre avec succes!`);
  logger.info(`Environnement: ${process.env.NODE_ENV}`);
  logger.info(`URL: ${process.env.BASE_URL || `http://localhost:${PORT}`}`);
  logger.info(`API Prefix: ${API_PREFIX}`);
  logger.info(`Cle API: ACTIVEE sur toutes les routes ${API_PREFIX}/*`);
  logger.info(`Middleware Password Change: ACTIF sur routes protegees`);
  logger.info(`Route publique admin: ${process.env.BASE_URL || `http://localhost:${PORT}`}/create-admin-public`);
  logger.info(`Test Check: ${process.env.BASE_URL || `http://localhost:${PORT}`}/test`);
  logger.info(`API DOCS: ${process.env.BASE_URL || `http://localhost:${PORT}`}/api-docs`);
  logger.info('========================================');
});

// ========================================
// GESTION ARRET GRACIEUX
// ========================================
process.on('unhandledRejection', (err) => {
  logger.error('ERREUR NON GEREE (Unhandled Rejection):', err);
  server.close(() => {
    logger.info('Serveur arrete suite a une erreur non geree');
    process.exit(1);
  });
});

process.on('uncaughtException', (err) => {
  logger.error('ERREUR NON CAPTUREE (Uncaught Exception):', err);
  server.close(() => {
    logger.info('Serveur arrete suite a une exception non capturee');
    process.exit(1);
  });
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM recu. Fermeture gracieuse en cours...');
  server.close(() => {
    logger.info('Serveur ferme proprement');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT recu (Ctrl+C). Fermeture en cours...');
  server.close(() => {
    logger.info('Serveur ferme proprement');
    process.exit(0);
  });
});

module.exports = app;