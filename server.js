// server.js - Ajout du middleware API Key
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

// Middleware
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler.middleware');
const verifyApiKey = require('./middleware/apiKey.middleware');

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
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`Origine CORS refusee: ${origin}`);
      callback(new Error('Non autorise par CORS'));
    }
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
// TEST CHECK (SANS CLE API)
// ========================================
app.get('/test', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'DigiTontine API est en ligne',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: APP.VERSION,
  });
});

// ========================================
// ROUTE RACINE (SANS CLE API)
// ========================================
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

// ========================================
// ROUTE PUBLIQUE CREATION ADMIN (SANS CLE API)
// ATTENTION: A placer AVANT le middleware verifyApiKey
// ========================================
app.post('/create-admin-public', createAdmin);

// ========================================
// MIDDLEWARE CLE API - APPLIQUE SUR TOUTES LES ROUTES /digitontine/*
// ========================================
const API_PREFIX = '/digitontine';

// IMPORTANT : Verification de la cle API sur toutes les routes API
app.use(API_PREFIX, verifyApiKey);

// ========================================
// ROUTES API (PROTEGEES PAR CLE API)
// ========================================
app.use(`${API_PREFIX}/auth`, authRoutes);
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
app.use((err, req, res, next) => {
  logger.error('Erreur non geree:', err);
  return ApiResponse.serverError(res, err.message);
});

// ========================================
// DEMARRAGE SERVEUR
// ========================================
const PORT = APP.PORT;

const server = app.listen(PORT, () => {
  logger.info('========================================');
  logger.info(`${APP.NAME} API demarre avec succes!`);
  logger.info(`Environnement: ${process.env.NODE_ENV}`);
  logger.info(`URL: ${process.env.BASE_URL || `http://localhost:${PORT}`}`);
  logger.info(`API Prefix: ${API_PREFIX}`);
  logger.info(`Cle API: ACTIVEE sur toutes les routes ${API_PREFIX}/*`);
  logger.info(`Route publique admin: ${process.env.BASE_URL || `http://localhost:${PORT}`}/create-admin-public`);
  logger.info(`Test Check: ${process.env.BASE_URL || `http://localhost:${PORT}`}/test`);
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