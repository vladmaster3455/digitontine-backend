// controllers/auth.controller.js
const User = require('../models/User');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { generateTokenPair } = require('../config/jwt');
const { validatePasswordStrength } = require('../utils/helpers');
const emailService = require('../services/email.service');
const crypto = require('crypto');

/**
 * @desc    Connexion utilisateur (Admin/Trésorier/Membre)
 * @route   POST /api/v1/auth/login
 * @access  Public
 * 
 * US 1.1, 1.5 : Connexion
 */
const login = async (req, res) => {
  try {
    const { identifier, motDePasse } = req.body;

    // Trouver l'utilisateur par email ou téléphone
    const user = await User.findByEmailOrPhone(identifier);

    if (!user) {
      logger.warn(` Tentative connexion échouée - Utilisateur introuvable: ${identifier}`);
      
      // Log tentative échouée
      await User.findOneAndUpdate(
        { $or: [{ email: identifier }, { numeroTelephone: identifier }] },
        { $push: { loginHistory: { date: Date.now(), ip: req.ip, userAgent: req.get('user-agent'), success: false } } }
      );

      return ApiResponse.unauthorized(res, 'Identifiants incorrects');
    }

    // Vérifier si compte actif
    if (!user.isActive) {
      logger.warn(` Tentative connexion compte désactivé: ${user.email}`);
      return ApiResponse.forbidden(res, 'Votre compte a été désactivé. Contactez l\'administrateur.');
    }

    // Vérifier mot de passe
    const isPasswordValid = await user.comparePassword(motDePasse);

    if (!isPasswordValid) {
      logger.warn(` Mot de passe incorrect pour: ${user.email}`);
      
      // Log tentative échouée
      user.logLogin(req.ip, req.get('user-agent'), false);
      await user.save();

      return ApiResponse.unauthorized(res, 'Identifiants incorrects');
    }

    //  Connexion réussie
    user.logLogin(req.ip, req.get('user-agent'), true);
    await user.save();

    // Générer tokens JWT
    const { accessToken, refreshToken } = generateTokenPair(user);

    logger.info(` Connexion réussie - ${user.email} (${user.role})`);

    return ApiResponse.success(res, {
      user: {
        id: user._id,
        prenom: user.prenom,
        nom: user.nom,
        nomComplet: user.nomComplet,
        email: user.email,
        numeroTelephone: user.numeroTelephone,
        role: user.role,
        isFirstLogin: user.isFirstLogin,
      },
      accessToken,
      refreshToken,
      requiresPasswordChange: user.isFirstLogin,
    }, 'Connexion réussie');

  } catch (error) {
    logger.error(' Erreur login:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Changement de mot de passe (première connexion OBLIGATOIRE)
 * @route   POST /api/v1/auth/first-password-change
 * @access  Private (tous)
 * 
 * US 1.2 : Changement obligatoire première connexion
 */
const firstPasswordChange = async (req, res) => {
  try {
    const { ancienMotDePasse, nouveauMotDePasse } = req.body;
    const user = req.user;

    // Vérifier que c'est bien la première connexion
    if (!user.isFirstLogin) {
      return ApiResponse.error(res, 'Cette action est réservée à la première connexion', 400);
    }

    // Vérifier ancien mot de passe
    const isOldPasswordValid = await user.comparePassword(ancienMotDePasse);
    if (!isOldPasswordValid) {
      return ApiResponse.error(res, 'Ancien mot de passe incorrect', 400);
    }

    // Valider force du nouveau mot de passe
    const validation = validatePasswordStrength(nouveauMotDePasse);
    if (!validation.isValid) {
      return ApiResponse.validationError(res, validation.errors.map(err => ({ message: err })));
    }

    // Vérifier que nouveau ≠ ancien
    if (ancienMotDePasse === nouveauMotDePasse) {
      return ApiResponse.error(res, 'Le nouveau mot de passe doit être différent de l\'ancien', 400);
    }

    // Mettre à jour
    user.motDePasse = nouveauMotDePasse;
    user.isFirstLogin = false;
    user.lastPasswordChange = Date.now();
    await user.save();

    logger.info(` Premier changement de MDP - ${user.email}`);

    // Envoyer email confirmation
    try {
      await emailService.sendPasswordChangeConfirmation(user);
    } catch (emailError) {
      logger.error(' Erreur envoi email confirmation:', emailError);
    }

    return ApiResponse.success(res, {
      message: 'Mot de passe changé avec succès. Vous pouvez maintenant utiliser l\'application.',
    }, 'Mot de passe changé');

  } catch (error) {
    logger.error(' Erreur firstPasswordChange:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Changement de mot de passe volontaire
 * @route   POST /api/v1/auth/change-password
 * @access  Private (tous)
 * 
 * US 1.6 : Changement volontaire
 */
const changePassword = async (req, res) => {
  try {
    const { ancienMotDePasse, nouveauMotDePasse } = req.body;
    const user = req.user;

    // Vérifier ancien mot de passe
    const isOldPasswordValid = await user.comparePassword(ancienMotDePasse);
    if (!isOldPasswordValid) {
      return ApiResponse.error(res, 'Ancien mot de passe incorrect', 400);
    }

    // Valider nouveau mot de passe
    const validation = validatePasswordStrength(nouveauMotDePasse);
    if (!validation.isValid) {
      return ApiResponse.validationError(res, validation.errors.map(err => ({ message: err })));
    }

    // Vérifier différence
    if (ancienMotDePasse === nouveauMotDePasse) {
      return ApiResponse.error(res, 'Le nouveau mot de passe doit être différent', 400);
    }

    // Mettre à jour
    user.motDePasse = nouveauMotDePasse;
    user.lastPasswordChange = Date.now();
    await user.save();

    logger.info(` Changement MDP volontaire - ${user.email}`);

    // Email confirmation
    try {
      await emailService.sendPasswordChangeConfirmation(user);
    } catch (emailError) {
      logger.error('Erreur email:', emailError);
    }

    return ApiResponse.success(res, {
      message: 'Mot de passe changé. Reconnectez-vous avec le nouveau mot de passe.',
    }, 'Mot de passe changé');

  } catch (error) {
    logger.error(' Erreur changePassword:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Demander réinitialisation mot de passe (étape 1)
 * @route   POST /api/v1/auth/forgot-password
 * @access  Public
 * 
 * US 1.7 : Mot de passe oublié
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });

    // Toujours retourner succès (sécurité - ne pas révéler si email existe)
    if (!user) {
      logger.warn(` Tentative reset MDP - Email inexistant: ${email}`);
      return ApiResponse.success(res, {
        message: 'Si cet email existe, un code de réinitialisation a été envoyé.',
      });
    }

    // Générer code 6 chiffres
    const resetCode = user.generatePasswordResetToken();
    await user.save();

    // Envoyer email avec code
    try {
      await emailService.sendPasswordResetCode(user, resetCode);
      logger.info(` Code reset envoyé à ${user.email}`);
    } catch (emailError) {
      logger.error(' Erreur envoi email reset:', emailError);
      return ApiResponse.error(res, 'Erreur lors de l\'envoi de l\'email', 500);
    }

    return ApiResponse.success(res, {
      message: 'Un code de vérification a été envoyé à votre email.',
      expiresIn: '15 minutes',
    });

  } catch (error) {
    logger.error(' Erreur forgotPassword:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Réinitialiser mot de passe avec code (étape 2)
 * @route   POST /api/v1/auth/reset-password
 * @access  Public
 * 
 * US 1.7 : Reset avec code
 */
const resetPassword = async (req, res) => {
  try {
    const { email, code, nouveauMotDePasse } = req.body;

    // Hasher le code reçu pour comparaison
    const hashedCode = crypto.createHash('sha256').update(code).digest('hex');

    const user = await User.findOne({
      email: email.toLowerCase(),
      resetPasswordToken: hashedCode,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      logger.warn(` Code reset invalide ou expiré pour: ${email}`);
      return ApiResponse.error(res, 'Code invalide ou expiré', 400);
    }

    // Valider nouveau mot de passe
    const validation = validatePasswordStrength(nouveauMotDePasse);
    if (!validation.isValid) {
      return ApiResponse.validationError(res, validation.errors.map(err => ({ message: err })));
    }

    // Réinitialiser
    user.motDePasse = nouveauMotDePasse;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    user.lastPasswordChange = Date.now();
    await user.save();

    logger.info(` Reset MDP réussi - ${user.email}`);

    // Email confirmation
    try {
      await emailService.sendPasswordChangeConfirmation(user);
    } catch (emailError) {
      logger.error(' Erreur email:', emailError);
    }

    return ApiResponse.success(res, {
      message: 'Mot de passe réinitialisé avec succès. Vous pouvez vous reconnecter.',
    }, 'Mot de passe réinitialisé');

  } catch (error) {
    logger.error(' Erreur resetPassword:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Obtenir mon profil
 * @route   GET /api/v1/auth/me
 * @access  Private
 */
const getMe = async (req, res) => {
  try {
    const user = req.user;

    return ApiResponse.success(res, {
      user: {
        id: user._id,
        prenom: user.prenom,
        nom: user.nom,
        nomComplet: user.nomComplet,
        email: user.email,
        numeroTelephone: user.numeroTelephone,
        adresse: user.adresse,
        dateNaissance: user.dateNaissance,
        age: user.age,
        role: user.role,
        isActive: user.isActive,
        isFirstLogin: user.isFirstLogin,
        lastPasswordChange: user.lastPasswordChange,
        preferences: user.preferences,
        createdAt: user.createdAt,
      },
    });

  } catch (error) {
    logger.error(' Erreur getMe:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Déconnexion
 * @route   POST /api/v1/auth/logout
 * @access  Private
 */
const logout = async (req, res) => {
  try {
    const user = req.user;

    logger.info(` Déconnexion - ${user.email}`);

    return ApiResponse.success(res, {
      message: 'Déconnexion réussie',
    }, 'Déconnexion réussie');

  } catch (error) {
    logger.error(' Erreur logout:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Enregistrer token FCM (push notifications)
 * @route   POST /api/v1/auth/fcm-token
 * @access  Private
 */
const registerFCMToken = async (req, res) => {
  try {
    const { fcmToken, device } = req.body;
    const user = req.user;

    user.addFCMToken(fcmToken, device || 'Unknown');
    await user.save();

    logger.info(` Token FCM enregistré - ${user.email}`);

    return ApiResponse.success(res, {
      message: 'Token FCM enregistré',
    });

  } catch (error) {
    logger.error(' Erreur registerFCMToken:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Supprimer token FCM
 * @route   DELETE /api/v1/auth/fcm-token
 * @access  Private
 */
const removeFCMToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;
    const user = req.user;

    user.removeFCMToken(fcmToken);
    await user.save();

    logger.info(` Token FCM supprimé - ${user.email}`);

    return ApiResponse.success(res, {
      message: 'Token FCM supprimé',
    });

  } catch (error) {
    logger.error(' Erreur removeFCMToken:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Vérifier token (healthcheck)
 * @route   GET /api/v1/auth/verify
 * @access  Private
 */
const verifyToken = async (req, res) => {
  try {
    const user = req.user;

    return ApiResponse.success(res, {
      valid: true,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
    });

  } catch (error) {
    logger.error(' Erreur verifyToken:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Créer un admin (route publique - DÉVELOPPEMENT UNIQUEMENT)
 * @route   POST /api/v1/auth/create-admin
 * @access  Public
 * @warning À DÉSACTIVER EN PRODUCTION
 */
const createAdmin = async (req, res) => {
  try {
    const { prenom, nom, email, numeroTelephone, motDePasse } = req.body;

    // Vérifier si l'email existe déjà
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return ApiResponse.error(res, 'Cet email est déjà utilisé', 400);
    }

    // Vérifier si le numéro existe déjà
    const existingPhone = await User.findOne({ numeroTelephone });
    if (existingPhone) {
      return ApiResponse.error(res, 'Ce numéro de téléphone est déjà utilisé', 400);
    }

    // Créer l'admin
    const admin = await User.create({
      prenom,
      nom,
      email: email.toLowerCase(),
      numeroTelephone,
      motDePasse,
      role: 'admin',
      isActive: true,
      isFirstLogin: false, // Pas de changement de mot de passe obligatoire
    });

    logger.info(` Admin créé via route publique - ${admin.email}`);

    return ApiResponse.success(res, {
      user: {
        id: admin._id,
        prenom: admin.prenom,
        nom: admin.nom,
        nomComplet: admin.nomComplet,
        email: admin.email,
        numeroTelephone: admin.numeroTelephone,
        role: admin.role,
      },
    }, 'Admin créé avec succès');

  } catch (error) {
    logger.error(' Erreur createAdmin:', error);
    return ApiResponse.serverError(res);
  }
};

module.exports = {
  login,
  firstPasswordChange,
  changePassword,
  forgotPassword,
  resetPassword,
  getMe,
  logout,
  registerFCMToken,
  removeFCMToken,
  verifyToken,
   createAdmin,
};