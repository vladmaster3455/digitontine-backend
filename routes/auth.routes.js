// routes/auth.routes.js
const express = require('express');
const router = express.Router();

const {
  login,
  firstPasswordChange,
  changePassword,
  forgotPassword,
  resetPassword,
  getMe,
  logout,
  registerFCMToken,
  removeFCMToken,
  verifyToken: verifyTokenController, // ✅ RENOMMÉ POUR ÉVITER LE CONFLIT
} = require('../controllers/auth.controller');

const {
  validateLogin,
  validateFirstPasswordChange,
  validatePasswordChange,
  validateForgotPassword,
  validateResetPassword,
  validateFCMToken,
} = require('../validators/auth.validator');

const { validate } = require('../middleware/validator.middleware');
const { verifyToken: authMiddleware } = require('../middleware/auth.middleware');
const { loginLimiter, sensitiveActionsLimiter } = require('../middleware/rateLimit.middleware');
const { auditLog } = require('../middleware/audit.middleware');

// ========================================
// ROUTES PUBLIQUES (sans authentification)
// ========================================

/**
 * @route   POST /digitontine/auth/login
 * @desc    Connexion utilisateur
 * @access  Public
 * US 1.1, 1.5
 */
router.post(
  '/login',
  loginLimiter, // 5 tentatives max par 15min
  validateLogin,
  validate,
  auditLog('LOGIN', 'User'),
  login
);

/**
 * @route   POST /digitontine/auth/forgot-password
 * @desc    Demander réinitialisation de mot de passe
 * @access  Public
 * US 1.7
 */
router.post(
  '/forgot-password',
  sensitiveActionsLimiter, // 10 tentatives max par heure
  validateForgotPassword,
  validate,
  auditLog('FORGOT_PASSWORD', 'User'),
  forgotPassword
);

/**
 * @route   POST /digitontine/auth/reset-password
 * @desc    Réinitialiser mot de passe avec code
 * @access  Public
 * US 1.7
 */
router.post(
  '/reset-password',
  sensitiveActionsLimiter,
  validateResetPassword,
  validate,
  auditLog('RESET_PASSWORD', 'User'),
  resetPassword
);

// ========================================
// ROUTES PRIVÉES (authentification requise)
// ========================================

/**
 * @route   GET /digitontine/auth/me
 * @desc    Obtenir mon profil
 * @access  Private
 */
router.get(
  '/me',
  authMiddleware,
  getMe
);

/**
 * @route   GET /digitontine/auth/verify
 * @desc    Vérifier validité du token
 * @access  Private
 */
router.get(
  '/verify',
  authMiddleware,
  verifyTokenController // ✅ UTILISATION DU NOM RENOMMÉ
);

/**
 * @route   POST /digitontine/auth/first-password-change
 * @desc    Changement obligatoire première connexion
 * @access  Private
 * US 1.2
 */
router.post(
  '/first-password-change',
  authMiddleware,
  validateFirstPasswordChange,
  validate,
  auditLog('CHANGE_PASSWORD', 'User'),
  firstPasswordChange
);

/**
 * @route   POST /digitontine/auth/change-password
 * @desc    Changement de mot de passe volontaire
 * @access  Private
 * US 1.6
 */
router.post(
  '/change-password',
  authMiddleware,
  validatePasswordChange,
  validate,
  auditLog('CHANGE_PASSWORD', 'User'),
  changePassword
);

/**
 * @route   POST /digitontine/auth/logout
 * @desc    Déconnexion
 * @access  Private
 */
router.post(
  '/logout',
  authMiddleware,
  auditLog('LOGOUT', 'User'),
  logout
);

/**
 * @route   POST /digitontine/auth/fcm-token
 * @desc    Enregistrer token FCM (push notifications)
 * @access  Private
 */
router.post(
  '/fcm-token',
  authMiddleware,
  validateFCMToken,
  validate,
  registerFCMToken
);

/**
 * @route   DELETE /digitontine/auth/fcm-token
 * @desc    Supprimer token FCM
 * @access  Private
 */
router.delete(
  '/fcm-token',
  authMiddleware,
  validateFCMToken,
  validate,
  removeFCMToken
);

/**
 * @swagger
 * /digitontine/auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Mot de passe oublié
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string }
 *     responses:
 *       200:
 *         description: Code envoyé
 */

/**
 * @swagger
 * /digitontine/auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Réinitialiser mot de passe avec code
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code, nouveauMotDePasse]
 *             properties:
 *               email: { type: string }
 *               code: { type: string }
 *               nouveauMotDePasse: { type: string }
 *     responses:
 *       200:
 *         description: Mot de passe réinitialisé
 */

/**
 * @swagger
 * /digitontine/auth/first-password-change:
 *   post:
 *     tags: [Auth]
 *     summary: Changement obligatoire première connexion
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ancienMotDePasse, nouveauMotDePasse]
 *             properties:
 *               ancienMotDePasse: { type: string }
 *               nouveauMotDePasse: { type: string }
 *     responses:
 *       200:
 *         description: Mot de passe changé
 */

/**
 * @swagger
 * /digitontine/auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Changement volontaire de mot de passe
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ancienMotDePasse, nouveauMotDePasse]
 *             properties:
 *               ancienMotDePasse: { type: string }
 *               nouveauMotDePasse: { type: string }
 *     responses:
 *       200:
 *         description: Mot de passe changé
 */

/**
 * @swagger
 * /digitontine/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Déconnexion
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Déconnexion réussie
 */

module.exports = router;