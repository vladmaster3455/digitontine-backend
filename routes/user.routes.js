// routes/user.routes.js
const express = require('express');
const router = express.Router();

//  Import complet depuis cloudinary.service
const { 
  uploadIdentityPhoto, 
  uploadProfilePhoto,
  validateFileUpload  //  AJOUT OBLIGATOIRE
} = require('../services/cloudinary.service');

const {
  createMembre,
  createTresorier,
  updateUser,
  updateMyProfile,
  listUsers,
  getUserDetails,
  toggleActivation,
  deleteUser,
  adminResetPassword,
  getUserStats,
  updateProfilePhoto,    //  AJOUT
  deleteProfilePhoto,    //  AJOUT
} = require('../controllers/user.controller');

const {
  validateCreateUser,
  validateUpdateUser,
  validateUpdateProfile,
  validateToggleActivation,
  validateDeleteUser,
  validateListUsers,
  validateUserId,
  validateAdminResetPassword,
} = require('../validators/user.validator');

const { validate, validateMongoId } = require('../middleware/validator.middleware');
const { verifyToken } = require('../middleware/auth.middleware');
const { isAdmin, isSelfOrAdmin } = require('../middleware/role.middleware');
const { auditLog } = require('../middleware/audit.middleware');
const { requireDoubleValidation } = require('../middleware/doubleValidation.middleware');

// ========================================
// ROUTES ADMIN - CRÉATION UTILISATEURS
// ========================================

/**
 * @route   POST /digitontine/users/membre
 * @desc    Créer un compte Membre AVEC photo d'identité (obligatoire)
 * @access  Admin
 * US 1.3
 */
router.post(
  '/membre',
  verifyToken,
  isAdmin,
  uploadIdentityPhoto,                    //  Upload du fichier
  //validateFileUpload('photoIdentite'),    //  Vérifier présence
  validateCreateUser,                     //  Valider données
  validate,                               //  Exécuter validation
  auditLog('CREATE_USER', 'User'),
  createMembre
);

/**
 * @route   POST /digitontine/users/tresorier
 * @desc    Créer un compte Trésorier AVEC photo d'identité (obligatoire)
 * @access  Admin
 * US 1.4
 */
router.post(
  '/tresorier',
  verifyToken,
  isAdmin,
  uploadIdentityPhoto,                    //  ORDRE CORRIGÉ
  //validateFileUpload('photoIdentite'),    //  AJOUT
  validateCreateUser,
  validate,
  auditLog('CREATE_USER', 'User'),
  createTresorier
);

// ========================================
// ROUTES ADMIN - GESTION UTILISATEURS
// ========================================

/**
 * @route   GET /digitontine/users
 * @desc    Liste des utilisateurs avec filtres
 * @access  Admin
 * US 1.9
 */
router.get(
  '/',
  verifyToken,
  isAdmin,
  validateListUsers,
  validate,
  listUsers
);

/**
 * @route   GET /digitontine/users/stats
 * @desc    Statistiques utilisateurs
 * @access  Admin
 */
router.get(
  '/stats',
  verifyToken,
  isAdmin,
  getUserStats
);

/**
 * @route   GET /digitontine/users/:userId
 * @desc    Détails d'un utilisateur
 * @access  Admin ou utilisateur lui-même
 * US 1.10
 */
router.get(
  '/:userId',
  verifyToken,
  isSelfOrAdmin,
  validateUserId,
  validate,
  getUserDetails
);

/**
 * @route   PUT /digitontine/users/:userId
 * @desc    Modifier un utilisateur (Admin)
 * @access  Admin
 * @note     LA PHOTO D'IDENTITÉ N'EST JAMAIS MODIFIABLE
 * US 1.8
 */
router.put(
  '/:userId',
  verifyToken,
  isAdmin,
  validateUpdateUser,
  validate,
  auditLog('UPDATE_USER', 'User'),
  updateUser
);

/**
 * @route   POST /digitontine/users/:userId/toggle-activation
 * @desc    Activer/Désactiver un utilisateur (avec double validation)
 * @access  Admin
 * US 1.11
 */
router.post(
  '/:userId/toggle-activation',
  verifyToken,
  isAdmin,
  validateToggleActivation,
  validate,
  requireDoubleValidation('ACTIVATE_USER'),
  auditLog('TOGGLE_ACTIVATION', 'User'),
  toggleActivation
);

/**
 * @route   DELETE /digitontine/users/:userId
 * @desc    Supprimer un utilisateur (avec double validation)
 * @access  Admin
 * US 1.12
 */
router.delete(
  '/:userId',
  verifyToken,
  isAdmin,
  validateDeleteUser,
  validate,
  requireDoubleValidation('DELETE_USER'),
  auditLog('DELETE_USER', 'User'),
  deleteUser
);

/**
 * @route   POST /digitontine/users/:userId/reset-password
 * @desc    Réinitialiser manuellement le mot de passe
 * @access  Admin
 * US 1.13
 */
router.post(
  '/:userId/reset-password',
  verifyToken,
  isAdmin,
  validateAdminResetPassword,
  validate,
  auditLog('RESET_PASSWORD', 'User'),
  adminResetPassword
);

// ========================================
// ROUTES UTILISATEUR - MON PROFIL
// ========================================

/**
 * @route   PUT /digitontine/users/me
 * @desc    Modifier mon propre profil
 * @access  Private (Membre/Trésorier)
 * US 1.10
 */
router.put(
  '/me',
  verifyToken,
  validateUpdateProfile,
  validate,
  auditLog('UPDATE_PROFILE', 'User'),
  updateMyProfile
);

/**
 *  @route   PUT /digitontine/users/me/photo-profil
 * @desc    Mettre à jour sa photo de profil (MODIFIABLE)
 * @access  Private (Membre/Trésorier)
 */
router.put(
  '/me/photo-profil',
  verifyToken,
  uploadProfilePhoto,
  validateFileUpload('photoProfil'),
  auditLog('UPDATE_PROFILE_PHOTO', 'User'),
  updateProfilePhoto
);

/**
 *  @route   DELETE /digitontine/users/me/photo-profil
 * @desc    Supprimer sa photo de profil
 * @access  Private (Membre/Trésorier)
 */
router.delete(
  '/me/photo-profil',
  verifyToken,
  auditLog('DELETE_PROFILE_PHOTO', 'User'),
  deleteProfilePhoto
);
/**
 * @swagger
 * /digitontine/users/membre:
 *   post:
 *     tags: [Users]
 *     summary: Créer un membre (Admin)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [prenom, nom, email, numeroTelephone, dateNaissance, carteIdentite]
 *             properties:
 *               prenom: { type: string }
 *               nom: { type: string }
 *               email: { type: string }
 *               numeroTelephone: { type: string }
 *               dateNaissance: { type: string, format: date }
 *               carteIdentite: { type: string }
 *               adresse: { type: string }
 *               photoIdentite: { type: string, format: binary, description: "Photo identité (optionnelle)" }
 *     responses:
 *       201:
 *         description: Membre créé
 */

/**
 * @swagger
 * /digitontine/users:
 *   get:
 *     tags: [Users]
 *     summary: Liste des utilisateurs
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [Membre, Tresorier, Administrateur] }
 *     responses:
 *       200:
 *         description: Liste paginée
 */

module.exports = router;