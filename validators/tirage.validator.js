// validators/tirage.validator.js
const { body, param, query } = require('express-validator');

/**
 * Validation création tirage aléatoire
 */
const validateCreateTirage = [
  body('tontineId')
    .notEmpty()
    .withMessage('L\'ID de la tontine est requis')
    .isMongoId()
    .withMessage('ID de tontine invalide'),

  body('methodeTirage')
    .optional()
    .isIn(['aleatoire', 'tour_de_role', 'manuel'])
    .withMessage('Méthode de tirage invalide'),

  body('beneficiaireId')
    .optional()
    .isMongoId()
    .withMessage('ID du bénéficiaire invalide')
    .custom((value, { req }) => {
      // Si méthode manuelle, bénéficiaire requis
      if (req.body.methodeTirage === 'manuel' && !value) {
        throw new Error('Le bénéficiaire est requis pour un tirage manuel');
      }
      return true;
    }),

  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Les notes ne peuvent pas dépasser 500 caractères'),
];

/**
 * Validation validation tirage (par Trésorier)
 */
const validateValidateTirage = [
  param('tirageId')
    .notEmpty()
    .withMessage('L\'ID du tirage est requis')
    .isMongoId()
    .withMessage('ID de tirage invalide'),

  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Les notes ne peuvent pas dépasser 500 caractères'),
];

/**
 * Validation paiement tirage
 */
const validatePayTirage = [
  param('tirageId')
    .notEmpty()
    .withMessage('L\'ID du tirage est requis')
    .isMongoId()
    .withMessage('ID de tirage invalide'),

  body('moyenPaiement')
    .notEmpty()
    .withMessage('Le moyen de paiement est requis')
    .isIn(['Wave', 'Orange Money', 'Virement', 'Cash'])
    .withMessage('Moyen de paiement invalide'),

  body('referencePaiement')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('La référence ne peut pas dépasser 100 caractères'),

  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Les notes ne peuvent pas dépasser 500 caractères'),
];

/**
 * Validation liste tirages
 */
const validateListTirages = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Le numéro de page doit être un entier positif'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('La limite doit être entre 1 et 100'),

  query('tontineId')
    .optional()
    .isMongoId()
    .withMessage('ID de tontine invalide'),

  query('beneficiaireId')
    .optional()
    .isMongoId()
    .withMessage('ID du bénéficiaire invalide'),

  query('statutPaiement')
    .optional()
    .isIn(['en_attente', 'paye', 'echec'])
    .withMessage('Statut de paiement invalide'),

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
 * Validation ID tirage
 */
const validateTirageId = [
  param('tirageId')
    .notEmpty()
    .withMessage('L\'ID du tirage est requis')
    .isMongoId()
    .withMessage('ID de tirage invalide'),
];

/**
 * Validation vérification éligibilité
 */
const validateCheckEligibility = [
  param('tontineId')
    .notEmpty()
    .withMessage('L\'ID de la tontine est requis')
    .isMongoId()
    .withMessage('ID de tontine invalide'),
];

module.exports = {
  validateCreateTirage,
  validateValidateTirage,
  validatePayTirage,
  validateListTirages,
  validateTirageId,
  validateCheckEligibility,
};