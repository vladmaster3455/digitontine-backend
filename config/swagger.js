// config/swagger.js
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DigiTontine API',
      version: '1.0.0',
      description: 'API Backend pour la gestion de tontines digitales au Sénégal',
      contact: {
        name: 'DigiTontine Support',
        email: 'sergesenghor2342@gmail.com',
      },
      license: {
        name: 'Propriétaire',
      },
    },
    servers: [
      {
        url: process.env.BASE_URL || 'http://localhost:5000',
        description: 'Serveur de développement',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'Clé API requise pour toutes les routes /digitontine/* ',
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token JWT obtenu après connexion (/digitontine/auth/login)',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            prenom: { type: 'string', example: 'Moussa' },
            nom: { type: 'string', example: 'Diop' },
            nomComplet: { type: 'string', example: 'Moussa Diop' },
            email: { type: 'string', example: 'moussa@example.com' },
            numeroTelephone: { type: 'string', example: '+221771234567' },
            carteIdentite: { type: 'string', example: 'SN1234567890' },
            role: { type: 'string', enum: ['Membre', 'Tresorier', 'Administrateur'] },
            isActive: { type: 'boolean', example: true },
            photoIdentite: { type: 'string', example: 'https://res.cloudinary.com/...' },
            photoProfil: { type: 'string', example: 'https://res.cloudinary.com/...' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        
        Tontine: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            nom: { type: 'string', example: 'Tontine Quartier Nord' },
            description: { type: 'string', example: 'Tontine mensuelle du quartier' },
            montantCotisation: { type: 'number', example: 50000 },
            frequence: { type: 'string', enum: ['Hebdomadaire', 'Mensuelle', 'Personnalisee'] },
            statut: { type: 'string', enum: ['En attente', 'Active', 'Bloquee', 'Terminee'] },
            nombreMembres: { type: 'number', example: 10 },
            dateDebut: { type: 'string', format: 'date' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },

        Transaction: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            referenceTransaction: { type: 'string', example: 'TXN-2025-0001' },
            montant: { type: 'number', example: 50000 },
            montantCotisation: { type: 'number', example: 48000 },
            montantPenalite: { type: 'number', example: 2000 },
            type: { type: 'string', enum: ['cotisation', 'penalite', 'gain'] },
            moyenPaiement: { type: 'string', enum: ['Wave', 'Orange Money', 'Free Money', 'Cash'] },
            statut: { type: 'string', enum: ['En attente', 'Validee', 'Rejetee'] },
            dateTransaction: { type: 'string', format: 'date-time' },
          },
        },

        Tirage: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            montant: { type: 'number', example: 500000 },
            dateEffective: { type: 'string', format: 'date-time' },
            typeTirage: { type: 'string', enum: ['Automatique', 'Manuel'] },
            statut: { type: 'string', enum: ['Effectue', 'Annule'] },
          },
        },

        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Message d\'erreur' },
            errors: { type: 'array', items: { type: 'string' } },
          },
        },

        Success: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Opération réussie' },
            data: { type: 'object' },
          },
        },

        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'number', example: 1 },
            limit: { type: 'number', example: 10 },
            total: { type: 'number', example: 100 },
            totalPages: { type: 'number', example: 10 },
          },
        },
      },
      
      responses: {
        UnauthorizedError: {
          description: 'Token manquant ou invalide',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                message: 'Token manquant ou invalide',
              },
            },
          },
        },
        ForbiddenError: {
          description: 'Accès refusé - Permissions insuffisantes',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                message: 'Accès refusé',
              },
            },
          },
        },
        NotFoundError: {
          description: 'Ressource non trouvée',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                message: 'Ressource non trouvée',
              },
            },
          },
        },
        ValidationError: {
          description: 'Erreur de validation des données',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                message: 'Erreur de validation',
                errors: ['Le champ email est requis'],
              },
            },
          },
        },
      },
    },
    
    // 🔐 SÉCURITÉ : Applique l'API Key sur toutes les routes par défaut
    security: [
      {
        ApiKeyAuth: [],
      },
    ],
    
    tags: [
      { name: 'System', description: 'Routes système et santé de l\'API' },
      { name: 'Auth', description: 'Authentification et gestion de session' },
      { name: 'Users', description: 'Gestion des utilisateurs (Membre, Trésorier, Admin)' },
      { name: 'Tontines', description: 'Gestion des tontines' },
      { name: 'Transactions', description: 'Gestion des cotisations et transactions' },
      { name: 'Tirages', description: 'Gestion des tirages au sort' },
      { name: 'Dashboard', description: 'Tableaux de bord par rôle' },
      { name: 'Validations', description: 'Double validation (OTP Trésorier + Admin)' },
    ],
  },
  
  apis: ['./server.js', './routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

const swaggerUiOptions = {
  explorer: true,
  customCss: `
    .swagger-ui .topbar { background-color: #2c3e50; }
    .swagger-ui .info .title { color: #2c3e50; }
  `,
  customSiteTitle: 'DigiTontine API Documentation',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'none',
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    tryItOutEnabled: true,
  },
  customJs: [
    `
    window.onload = function() {
      const topbar = document.querySelector('.swagger-ui .topbar');
      if (topbar) {
        const btn = document.createElement('a');
        btn.textContent = '🔥 Télécharger la Spec';
        btn.href = '/swagger.json';
        btn.download = 'digiTontine-api.json';
        btn.style = 'margin-left:20px;padding:6px 12px;background:#e63946;color:white;border-radius:6px;text-decoration:none;font-weight:bold;';
        topbar.appendChild(btn);
      }
    };
    `
  ],
};


module.exports = {
  swaggerSpec,
  swaggerUi,
  swaggerUiOptions,
};