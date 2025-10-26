// routes/auth.routes.js
const express = require('express');
const router = express.Router();
const { param, query } = require('express-validator');

const {
  login,
  verifyLoginOTP,
  firstPasswordChange,
  changePassword,
  confirmPasswordChange,
  forgotPassword,
  resetPassword,
  getMe,
  logout,
  registerFCMToken,
  removeFCMToken,
  verifyToken: verifyTokenController,
  createAdmin,
} = require('../controllers/auth.controller');

const {
  validateLogin,
  validateVerifyLoginOTP,
  validateFirstPasswordChange,
  validatePasswordChange,
  validateForgotPassword,
  validateResetPassword,
  validateFCMToken,
  validateConfirmPasswordChange,
} = require('../validators/auth.validator');

const { validate } = require('../middleware/validator.middleware');
const { 
  verifyToken: authMiddleware,
  verifyTokenWithPassword 
} = require('../middleware/auth.middleware');
const { loginLimiter, sensitiveActionsLimiter } = require('../middleware/rateLimit.middleware');
const { auditLog } = require('../middleware/audit.middleware');

// ========================================
// ROUTES PUBLIQUES
// ========================================

/**
 * @route   POST /api/v1/auth/login
 * @desc    Connexion ETAPE 1 - Envoie OTP par email
 * @access  Public
 */
router.post(
  '/login',
  loginLimiter,
  validateLogin,
  validate,
  auditLog('LOGIN_STEP_1', 'User'),
  login
);

/**
 * @route   auth/verify-login-otp
 * @desc    Connexion ETAPE 2 - Verification OTP
 * @access  Public
 */
router.post(
  '/verify-login-otp',
  loginLimiter,
  validateVerifyLoginOTP,
  validate,
  auditLog('LOGIN_STEP_2', 'User'),
  verifyLoginOTP
);

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Demander reinitialisation de mot de passe
 * @access  Public
 */
router.post(
  '/forgot-password',
  sensitiveActionsLimiter,
  validateForgotPassword,
  validate,
  auditLog('FORGOT_PASSWORD', 'User'),
  forgotPassword
);

/**
 * @route   POST /api/v1/auth/reset-password
 * @desc    Reinitialiser mot de passe avec code
 * @access  Public
 */
router.post(
  '/reset-password',
  sensitiveActionsLimiter,
  validateResetPassword,
  validate,
  auditLog('RESET_PASSWORD', 'User'),
  resetPassword
);

/**
 * @route   GET /api/v1/auth/confirm-password-change/:token
 * @desc    Confirmer ou rejeter changement de mot de passe
 * @access  Public
 */
router.get(
  '/confirm-password-change/:token',
  validateConfirmPasswordChange,
  validate,
  auditLog('CONFIRM_PASSWORD_CHANGE', 'User'),
  confirmPasswordChange
);

// ========================================
// ROUTES PRIVEES
// ========================================

/**
 * @route   GET /api/v1/auth/me
 * @desc    Obtenir mon profil
 * @access  Private
 */
router.get(
  '/me',
  authMiddleware,
  getMe
);

/**
 * @route   GET /api/v1/auth/verify
 * @desc    Verifier validite du token
 * @access  Private
 */
router.get(
  '/verify',
  authMiddleware,
  verifyTokenController
);

/**
 * @route   POST /api/v1/auth/first-password-change
 * @desc    Changement obligatoire premiere connexion (avec confirmation email)
 * @access  Private
 */
router.post(
  '/first-password-change',
  verifyTokenWithPassword,
  validateFirstPasswordChange,
  validate,
  auditLog('FIRST_PASSWORD_CHANGE', 'User'),
  firstPasswordChange
);

/**
 * @route   POST /api/v1/auth/change-password
 * @desc    Changement de mot de passe volontaire (avec confirmation email)
 * @access  Private
 */
router.post(
  '/change-password',
  verifyTokenWithPassword,
  validatePasswordChange,
  validate,
  auditLog('CHANGE_PASSWORD', 'User'),
  changePassword
);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Deconnexion
 * @access  Private
 */
router.post(
  '/logout',
  authMiddleware,
  auditLog('LOGOUT', 'User'),
  logout
);

/**
 * @route   POST /api/v1/auth/fcm-token
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
 * @route   DELETE /api/v1/auth/fcm-token
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

// ========================================
// SWAGGER DOCUMENTATION
// ========================================

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Connexion etape 1 - Envoie OTP par email
 *     description: Verifie les identifiants et envoie un code OTP par email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - identifier
 *               - motDePasse
 *             properties:
 *               identifier:
 *                 type: string
 *                 description: Email ou numero de telephone
 *                 example: user@example.com
 *               motDePasse:
 *                 type: string
 *                 format: password
 *                 description: Mot de passe (min 8 caracteres)
 *                 example: Password123!
 *     responses:
 *       200:
 *         description: Code OTP envoye avec succes
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
 *                   example: Code envoye
 *                 data:
 *                   type: object
 *                   properties:
 *                     requiresOTP:
 *                       type: boolean
 *                       example: true
 *                     email:
 *                       type: string
 *                       example: user@example.com
 *                     message:
 *                       type: string
 *                       example: Un code de verification a ete envoye a votre email
 *                     expiresIn:
 *                       type: string
 *                       example: 15 minutes
 *       401:
 *         description: Identifiants incorrects
 *       403:
 *         description: Compte desactive
 */
/**
 * @swagger
 * /api/v1/auth/verify-login-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Connexion etape 2 - Verification du code OTP
 *     description: Verifie le code OTP et retourne les tokens JWT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - code
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               code:
 *                 type: string
 *                 pattern: '^[0-9]{6}$'
 *                 description: Code OTP a 6 chiffres
 *                 example: 123456
 *     responses:
 *       200:
 *         description: Connexion reussie
 *       400:
 *         description: Code invalide ou expire
 *       401:
 *         description: Email ou code incorrect
 */
/**
 * @swagger
 * /api/v1/auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Demander reinitialisation mot de passe
 *     description: Envoie un code de verification par email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: Code envoye
 *       404:
 *         description: Aucun compte associe a cet email
 *       403:
 *         description: Compte desactive
 */
/**
 * @swagger
 * /api/v1/auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reinitialiser mot de passe avec code
 *     description: Reinitialise le mot de passe et envoie email de confirmation
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - code
 *               - nouveauMotDePasse
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               code:
 *                 type: string
 *                 pattern: '^[0-9]{6}$'
 *                 example: 123456
 *               nouveauMotDePasse:
 *                 type: string
 *                 format: password
 *                 description: Min 8 car, 1 maj, 1 min, 1 chiffre, 1 special
 *                 example: NewPassword123!
 *     responses:
 *       200:
 *         description: Email de confirmation envoye
 *       400:
 *         description: Code invalide ou expire
 */
/**
 * @swagger
 * /api/v1/auth/confirm-password-change/{token}:
 *   get:
 *     tags: [Auth]
 *     summary: Confirmer ou rejeter changement de mot de passe
 *     description: Lien cliquable dans email pour approuver/rejeter changement
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 64
 *           maxLength: 64
 *         description: Token de confirmation
 *       - in: query
 *         name: action
 *         required: true
 *         schema:
 *           type: string
 *           enum: [approve, reject]
 *         description: Action a effectuer
 *     responses:
 *       200:
 *         description: Changement confirme ou annule
 *       400:
 *         description: Lien invalide ou expire
 */

/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Obtenir mon profil
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Profil utilisateur
 *       401:
 *         description: Non authentifie
 */

/**
 * @swagger
 * /api/v1/auth/verify:
 *   get:
 *     tags: [Auth]
 *     summary: Verifier validite du token JWT
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Token valide
 *       401:
 *         description: Token invalide ou expire
 */

/**
 * @swagger
 * /api/v1/auth/first-password-change:
 *   post:
 *     tags: [Auth]
 *     summary: Changement mot de passe premiere connexion
 *     description: Envoie email de confirmation avant application
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ancienMotDePasse
 *               - nouveauMotDePasse
 *             properties:
 *               ancienMotDePasse:
 *                 type: string
 *                 format: password
 *               nouveauMotDePasse:
 *                 type: string
 *                 format: password
 *                 description: Min 8 car, 1 maj, 1 min, 1 chiffre, 1 special
 *     responses:
 *       200:
 *         description: Email de confirmation envoye
 *       400:
 *         description: Erreur validation
 *       401:
 *         description: Non authentifie
 */

/**
 * @swagger
 * /api/v1/auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Changement mot de passe volontaire
 *     description: Envoie email de confirmation avant application
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ancienMotDePasse
 *               - nouveauMotDePasse
 *             properties:
 *               ancienMotDePasse:
 *                 type: string
 *                 format: password
 *               nouveauMotDePasse:
 *                 type: string
 *                 format: password
 *                 description: Min 8 car, 1 maj, 1 min, 1 chiffre, 1 special
 *     responses:
 *       200:
 *         description: Email de confirmation envoye
 *       400:
 *         description: Erreur validation
 *       401:
 *         description: Non authentifie
 */

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Deconnexion
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Deconnexion reussie
 *       401:
 *         description: Non authentifie
 */

/**
 * @swagger
 * /api/v1/auth/fcm-token:
 *   post:
 *     tags: [Auth]
 *     summary: Enregistrer token FCM pour notifications push
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fcmToken
 *             properties:
 *               fcmToken:
 *                 type: string
 *                 minLength: 10
 *               device:
 *                 type: string
 *                 maxLength: 100
 *     responses:
 *       200:
 *         description: Token enregistre
 *       401:
 *         description: Non authentifie
 *   delete:
 *     tags: [Auth]
 *     summary: Supprimer token FCM
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fcmToken
 *             properties:
 *               fcmToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token supprime
 *       401:
 *         description: Non authentifie
 */

module.exports = router;