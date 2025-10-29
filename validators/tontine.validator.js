// validators/tontine.validator.js
const { body, param, query } = require('express-validator');
const { TONTINE_STATUS, FREQUENCES } = require('../config/constants');

/**
 * Validation création tontine
 */
const validateCreateTontine = [
  body('nom')
    .trim()
    .notEmpty()
    .withMessage('Le nom de la tontine est requis')
    .isLength({ min: 3, max: 100 })
    .withMessage('Le nom doit contenir entre 3 et 100 caractères')
    .matches(/^[a-zA-Z0-9À-ÿ\s'-]+$/)
    .withMessage('Le nom ne peut contenir que des lettres, chiffres et espaces'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('La description ne peut pas dépasser 500 caractères'),

body('montantCotisation')
  .notEmpty()
  .withMessage('Le montant de cotisation est requis')
  .isInt({ min: 1 })  //  CHANGÉ : min: 1 au lieu de 1000
  .withMessage('Le montant doit être supérieur à 0')
  .custom((value) => {
    if (value % 1 !== 0) {
      throw new Error('Le montant doit être un nombre entier');
    }
    return true;
  }),

  body('frequence')
    .notEmpty()
    .withMessage('La fréquence est requise')
    .isIn(Object.values(FREQUENCES))
    .withMessage(`La fréquence doit être ${FREQUENCES.HEBDOMADAIRE} ou ${FREQUENCES.MENSUELLE}`),

  body('dateDebut')
    .notEmpty()
    .withMessage('La date de début est requise')
    .isISO8601()
    .withMessage('Format de date invalide (YYYY-MM-DD)')
    .custom((value) => {
      const dateDebut = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (dateDebut < today) {
        throw new Error('La date de début ne peut pas être dans le passé');
      }
      return true;
    }),

  body('dateFin')
    .notEmpty()
    .withMessage('La date de fin est requise')
    .isISO8601()
    .withMessage('Format de date invalide (YYYY-MM-DD)')
    .custom((value, { req }) => {
      const dateFin = new Date(value);
      const dateDebut = new Date(req.body.dateDebut);
      
      if (dateFin <= dateDebut) {
        throw new Error('La date de fin doit être après la date de début');
      }
      
      // Vérifier durée minimale (ex: au moins 1 mois)
      const diffDays = (dateFin - dateDebut) / (1000 * 60 * 60 * 24);
      if (diffDays < 30) {
        throw new Error('La durée minimale est de 30 jours');
      }
      
      return true;
    }),

  body('nombreMembresMin')
    .optional()
    .isInt({ min: 2 })
    .withMessage('Le nombre minimum de membres doit être au moins 2'),

  body('nombreMembresMax')
    .optional()
    .isInt({ min: 2, max: 100 })
    .withMessage('Le nombre maximum de membres doit être entre 2 et 100')
    .custom((value, { req }) => {
      const min = req.body.nombreMembresMin || 3;
      if (value < min) {
        throw new Error('Le maximum doit être supérieur ou égal au minimum');
      }
      return true;
    }),

  body('tauxPenalite')
    .optional()
    .isFloat({ min: 0, max: 50 })
    .withMessage('Le taux de pénalité doit être entre 0 et 50%'),

  body('delaiGrace')
    .optional()
    .isInt({ min: 0, max: 30 })
    .withMessage('Le délai de grâce doit être entre 0 et 30 jours'),
     body('tresorierAssigneId')
  .optional()
  .isMongoId()
  .withMessage('ID du trésorier invalide'),
   
];

/**
 * Validation modification tontine
 */
const validateUpdateTontine = [
  param('tontineId')
    .notEmpty()
    .withMessage('L\'ID de la tontine est requis')
    .isMongoId()
    .withMessage('ID de tontine invalide'),

  body('nom')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Le nom doit contenir entre 3 et 100 caractères'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('La description ne peut pas dépasser 500 caractères'),

  body('tauxPenalite')
    .optional()
    .isFloat({ min: 0, max: 50 })
    .withMessage('Le taux de pénalité doit être entre 0 et 50%'),

  body('delaiGrace')
    .optional()
    .isInt({ min: 0, max: 30 })
    .withMessage('Le délai de grâce doit être entre 0 et 30 jours'),

  // Ces champs ne peuvent être modifiés après activation
body('montantCotisation')
  .optional()
  .isInt({ min: 1 })
  .withMessage('Le montant doit être supérieur à 0'),

  body('frequence')
    .optional()
    .isIn(Object.values(FREQUENCES))
    .withMessage(`La fréquence doit être ${FREQUENCES.HEBDOMADAIRE} ou ${FREQUENCES.MENSUELLE}`),

  body('dateDebut')
    .optional()
    .isISO8601()
    .withMessage('Format de date invalide'),

  body('dateFin')
    .optional()
    .isISO8601()
    .withMessage('Format de date invalide'),
    body('tresorierAssigneId')
  .optional()
  .isMongoId()
  .withMessage('ID du trésorier invalide'),
];

/**
 * Validation ajout de membres
 */
const validateAddMembers = [
  param('tontineId')
    .notEmpty()
    .withMessage('L\'ID de la tontine est requis')
    .isMongoId()
    .withMessage('ID de tontine invalide'),

  body('membresIds')
    .notEmpty()
    .withMessage('La liste des membres est requise')
    .isArray({ min: 1 })
    .withMessage('Vous devez fournir au moins un membre'),

  body('membresIds.*')
    .isMongoId()
    .withMessage('ID de membre invalide'),
];

/**
 * Validation retrait de membre
 */
const validateRemoveMember = [
  param('tontineId')
    .notEmpty()
    .withMessage('L\'ID de la tontine est requis')
    .isMongoId()
    .withMessage('ID de tontine invalide'),

  param('userId')
    .notEmpty()
    .withMessage('L\'ID du membre est requis')
    .isMongoId()
    .withMessage('ID de membre invalide'),
];

/**
 * Validation activation tontine
 */
const validateActivateTontine = [
  param('tontineId')
    .notEmpty()
    .withMessage('L\'ID de la tontine est requis')
    .isMongoId()
    .withMessage('ID de tontine invalide'),
];

/**
 * Validation blocage tontine
 */
const validateBlockTontine = [
  param('tontineId')
    .notEmpty()
    .withMessage('L\'ID de la tontine est requis')
    .isMongoId()
    .withMessage('ID de tontine invalide'),

  body('motif')
    .notEmpty()
    .withMessage('Le motif de blocage est requis')
    .isLength({ min: 10, max: 500 })
    .withMessage('Le motif doit contenir entre 10 et 500 caractères'),
];

/**
 * Validation clôture tontine
 */
const validateCloseTontine = [
  param('tontineId')
    .notEmpty()
    .withMessage('L\'ID de la tontine est requis')
    .isMongoId()
    .withMessage('ID de tontine invalide'),

  body('genererRapport')
    .optional()
    .isBoolean()
    .withMessage('genererRapport doit être un booléen'),
];

/**
 * Validation suppression tontine
 */
const validateDeleteTontine = [
  param('tontineId')
    .notEmpty()
    .withMessage('L\'ID de la tontine est requis')
    .isMongoId()
    .withMessage('ID de tontine invalide'),

  body('confirmation')
    .notEmpty()
    .withMessage('La confirmation est requise')
    .equals('SUPPRIMER')
    .withMessage('Vous devez taper "SUPPRIMER" pour confirmer'),
];

/**
 * Validation liste tontines (query params)
 */
const validateListTontines = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Le numéro de page doit être un entier positif'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('La limite doit être entre 1 et 100'),

  query('statut')
    .optional()
    .isIn(Object.values(TONTINE_STATUS))
    .withMessage('Statut invalide'),

  query('search')
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage('La recherche doit contenir au moins 2 caractères'),

  query('dateDebut')
    .optional()
    .isISO8601()
    .withMessage('Format de date invalide'),

  query('dateFin')
    .optional()
    .isISO8601()
    .withMessage('Format de date invalide'),
];

/**
 * Validation ID tontine (param)
 */
const validateTontineId = [
  param('tontineId')
    .notEmpty()
    .withMessage('L\'ID de la tontine est requis')
    .isMongoId()
    .withMessage('ID de tontine invalide'),
];

module.exports = {
  validateCreateTontine,
  validateUpdateTontine,
  validateAddMembers,
  validateRemoveMember,
  validateActivateTontine,
  validateBlockTontine,
  validateCloseTontine,
  validateDeleteTontine,
  validateListTontines,
  validateTontineId,
};