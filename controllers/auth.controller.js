// controllers/auth.controller.js
const User = require('../models/User');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { generateTokenPair } = require('../config/jwt');
const { validatePasswordStrength } = require('../utils/helpers');
const emailService = require('../services/email.service');
const crypto = require('crypto');
const { ROLES } = require('../config/constants');

// Dans auth.controller.js - Remplace la fonction login

const login = async (req, res) => {
  try {
    const { identifier, motDePasse, skipOTP = false } = req.body;


    // Trouver l'utilisateur
    const user = await User.findByEmailOrPhone(identifier);

    if (!user) {
      logger.warn(`Tentative connexion echouee - Utilisateur introuvable: ${identifier}`);
      return ApiResponse.unauthorized(res, 'Identifiants incorrects');
    }

    // Verifier si compte actif
    if (!user.isActive) {
      logger.warn(`Tentative connexion compte desactive: ${user.email}`);
      return ApiResponse.forbidden(res, 'Votre compte a ete desactive. Contactez l\'administrateur.');
    }

    // Verifier mot de passe
    const isPasswordValid = await user.comparePassword(motDePasse);

    if (!isPasswordValid) {
      logger.warn(`Mot de passe incorrect pour: ${user.email}`);
      user.logLogin(req.ip, req.get('user-agent'), false);
      await user.save();
      return ApiResponse.unauthorized(res, 'Identifiants incorrects');
    }

    // Si skipOTP = true, connecter directement sans OTP
    if (skipOTP) {
      // Logger la connexion
      user.logLogin(req.ip, req.get('user-agent'), true);
      await user.save();

      // Recharger l'utilisateur
      const updatedUser = await User.findById(user._id);

      // Generer tokens JWT
      const { accessToken, refreshToken } = generateTokenPair(updatedUser);

      logger.info(`Connexion directe reussie - ${updatedUser.email} (${updatedUser.role})`);

      return ApiResponse.success(res, {
        user: {
          id: updatedUser._id,
          prenom: updatedUser.prenom,
          nom: updatedUser.nom,
          nomComplet: updatedUser.nomComplet,
          email: updatedUser.email,
          numeroTelephone: updatedUser.numeroTelephone,
          role: updatedUser.role,
          isFirstLogin: updatedUser.isFirstLogin,
        },
        accessToken,
        refreshToken,
        requiresPasswordChange: updatedUser.isFirstLogin,
        otpSkipped: true,
      }, 'Connexion reussie');
    }

    // Sinon, generer et envoyer OTP
    const otpCode = user.generateLoginOTP();
    await user.save();

    // Envoyer email avec code
    try {
      await emailService.sendLoginOTP(user, otpCode);
    } catch (emailError) {
      logger.error('Erreur envoi OTP:', emailError);
      // Nettoyer l'OTP si echec
      user.loginOTP = undefined;
      await user.save();
      return ApiResponse.error(res, 'Erreur lors de l\'envoi du code. Reessayez.', 500);
    }

    logger.info(`OTP envoye a ${user.email}`);

    return ApiResponse.success(res, {
      requiresOTP: true,
      email: user.email,
      message: 'Un code de verification a ete envoye a votre email',
      expiresIn: '15 minutes',
    }, 'Code envoye');

  } catch (error) {
    logger.error('Erreur login:', error);
    return ApiResponse.serverError(res);
  }
};

module.exports = { login };

/**
 * @desc   
 * @route   
 * @access  Public
 */
const verifyLoginOTP = async (req, res) => {
  try {
    const { email, code } = req.body;

    // Trouver l'utilisateur
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      logger.warn(`Verification OTP - Utilisateur introuvable: ${email}`);
      return ApiResponse.unauthorized(res, 'Email ou code incorrect');
    }

    // Verifier si compte actif
    if (!user.isActive) {
      return ApiResponse.forbidden(res, 'Compte desactive');
    }

    // Verifier l'OTP
    const verification = user.verifyLoginOTP(code);

    if (!verification.success) {
      await user.save(); // Sauvegarder les tentatives
      logger.warn(`OTP invalide pour ${user.email}: ${verification.message}`);
      return ApiResponse.error(res, verification.message, 400);
    }

    // OTP VALIDE - Logger la connexion
    user.logLogin(req.ip, req.get('user-agent'), true);
    await user.save();

    // Recharger l'utilisateur
    const updatedUser = await User.findById(user._id);

    // Generer tokens JWT
    const { accessToken, refreshToken } = generateTokenPair(updatedUser);

    logger.info(`Connexion reussie - ${updatedUser.email} (${updatedUser.role})`);

    return ApiResponse.success(res, {
      user: {
        id: updatedUser._id,
        prenom: updatedUser.prenom,
        nom: updatedUser.nom,
        nomComplet: updatedUser.nomComplet,
        email: updatedUser.email,
        numeroTelephone: updatedUser.numeroTelephone,
        role: updatedUser.role,
        isFirstLogin: updatedUser.isFirstLogin,
      },
      accessToken,
      refreshToken,
      requiresPasswordChange: updatedUser.isFirstLogin,
    }, 'Connexion reussie');

  } catch (error) {
    logger.error('Erreur verification OTP:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Changement de mot de passe (premiere connexion OBLIGATOIRE)
 * @route   POST /api/v1/auth/first-password-change
 * @access  Private
 */
const firstPasswordChange = async (req, res) => {
  try {
    const { ancienMotDePasse, nouveauMotDePasse } = req.body;
    const user = req.user;

    logger.info(`Tentative changement MDP premiere connexion - User: ${user.email}`);

    if (!user.isFirstLogin) {
      logger.warn(`Utilisateur ${user.email} pas en premiere connexion`);
      return ApiResponse.error(res, 'Cette action est reservee a la premiere connexion', 400);
    }

    // Verifier ancien mot de passe
    const isOldPasswordValid = await user.comparePassword(ancienMotDePasse);
    if (!isOldPasswordValid) {
      return ApiResponse.error(res, 'Ancien mot de passe incorrect', 400);
    }

    // Valider nouveau mot de passe
    const validation = validatePasswordStrength(nouveauMotDePasse);
    if (!validation.isValid) {
      return ApiResponse.validationError(res, validation.errors.map(err => ({ message: err })));
    }

    // Verifier difference
    if (ancienMotDePasse === nouveauMotDePasse) {
      return ApiResponse.error(res, 'Le nouveau mot de passe doit etre different', 400);
    }

    // Creer demande de confirmation
    const confirmationToken = await user.createPendingPasswordChange(nouveauMotDePasse);
    await user.save();

    // Envoyer email de confirmation
    try {
      await emailService.sendPasswordChangeConfirmationRequest(user, confirmationToken);
    } catch (emailError) {
      logger.error('Erreur envoi email:', emailError);
      user.pendingPasswordChange = undefined;
      await user.save();
      return ApiResponse.error(res, 'Erreur lors de l\'envoi de l\'email', 500);
    }

    logger.info(`Demande changement MDP premiere connexion envoyee a ${user.email}`);

    return ApiResponse.success(res, {
      requiresConfirmation: true,
      message: 'Un email de confirmation a ete envoye. Veuillez confirmer le changement pour acceder a l\'application.',
      email: user.email,
    }, 'Confirmation requise');

  } catch (error) {
    logger.error('Erreur firstPasswordChange:', error);
    return ApiResponse.serverError(res);
  }
};



/**
 * @desc    Changement de mot de passe volontaire (AVEC confirmation email)
 * @route   POST /api/v1/auth/change-password
 * @access  Private
 */
const changePassword = async (req, res) => {
  try {
    const { ancienMotDePasse, nouveauMotDePasse } = req.body;
    const user = req.user;

    logger.info(`Tentative changement MDP volontaire - User: ${user.email}`);

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

    // Vérifier que le nouveau mot de passe est différent de l'ancien
    if (ancienMotDePasse === nouveauMotDePasse) {
      return ApiResponse.error(res, 'Le nouveau mot de passe doit etre different de l\'ancien', 400);
    }

    // Créer demande de confirmation (comme firstPasswordChange)
    const confirmationToken = await user.createPendingPasswordChange(nouveauMotDePasse);
    await user.save();

    // Envoyer email de confirmation
    try {
      await emailService.sendPasswordChangeConfirmationRequest(user, confirmationToken);
    } catch (emailError) {
      logger.error('Erreur envoi email:', emailError);
      user.pendingPasswordChange = undefined;
      await user.save();
      return ApiResponse.error(res, 'Erreur lors de l\'envoi de l\'email', 500);
    }

    logger.info(`Demande changement MDP volontaire envoyée à ${user.email}`);

    return ApiResponse.success(res, {
      requiresConfirmation: true,
      message: 'Un email de confirmation a été envoyé. Vous devez confirmer le changement pour continuer à utiliser l\'application.',
      email: user.email,
    }, 'Confirmation requise');

  } catch (error) {
    logger.error('Erreur changePassword:', error);
    return ApiResponse.serverError(res);
  }
};
/**
 * @desc    Confirmer changement de mot de passe
 * @route   GET /api/v1/auth/confirm-password-change/:token
 * @access  Public
 */
const confirmPasswordChange = async (req, res) => {
  try {
    const { token } = req.params;
    const { action } = req.query; // 'approve' ou 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return ApiResponse.error(res, 'Action invalide (approve ou reject)', 400);
    }

    // Trouver l'utilisateur avec ce token
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      'pendingPasswordChange.confirmationToken': hashedToken,
      'pendingPasswordChange.confirmationExpiry': { $gt: Date.now() },
    });

    if (!user) {
      return ApiResponse.error(res, 'Lien invalide ou expire', 400);
    }

    if (action === 'approve') {
      // Approuver le changement
      const result = user.confirmPasswordChange(token);
      
      if (!result.success) {
        return ApiResponse.error(res, result.message, 400);
      }

      await user.save();

      // Envoyer email de confirmation
      try {
        await emailService.sendPasswordChangeApproved(user);
      } catch (emailError) {
        logger.error('Erreur email confirmation:', emailError);
      }

      logger.info(`Changement MDP confirme - ${user.email}`);

      return ApiResponse.success(res, {
        message: 'Mot de passe change avec succes. Vous pouvez maintenant vous connecter.',
        canLogin: true,
      }, 'Changement confirme');

    } else {
      // Rejeter le changement
      const result = user.rejectPasswordChange(token);
      
      if (!result.success) {
        return ApiResponse.error(res, result.message, 400);
      }

      await user.save();

      // Envoyer email d'annulation
      try {
        await emailService.sendPasswordChangeRejected(user);
      } catch (emailError) {
        logger.error('Erreur email rejet:', emailError);
      }

      logger.info(`Changement MDP rejete - ${user.email}`);

      return ApiResponse.success(res, {
        message: 'Changement annule. Votre ancien mot de passe reste actif.',
        canLogin: true,
      }, 'Changement annule');
    }

  } catch (error) {
    logger.error('Erreur confirmPasswordChange:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Demander reinitialisation mot de passe (etape 1)
 * @route   POST /api/v1/auth/forgot-password
 * @access  Public
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      logger.warn(`Tentative reset MDP - Email inexistant: ${email}`);
      return ApiResponse.notFound(res, 'Aucun compte associe a cet email');
    }

    if (!user.isActive) {
      logger.warn(`Tentative reset MDP - Compte desactive: ${email}`);
      return ApiResponse.forbidden(res, 'Ce compte est desactive. Contactez l\'administrateur.');
    }

    // Generer code 6 chiffres
    const resetCode = user.generatePasswordResetToken();
    await user.save();

    // Envoyer email avec code
    try {
      await emailService.sendPasswordResetCode(user, resetCode);
      logger.info(`Code reset envoye a ${user.email}`);
    } catch (emailError) {
      logger.error('Erreur envoi email reset:', emailError);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save();
      return ApiResponse.error(res, 'Erreur lors de l\'envoi de l\'email. Veuillez reessayer plus tard.', 500);
    }

    return ApiResponse.success(res, {
      message: 'Un code de verification a ete envoye a votre email.',
      email: user.email,
      expiresIn: '15 minutes',
    }, 'Code envoye');

  } catch (error) {
    logger.error('Erreur forgotPassword:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Reinitialiser mot de passe avec code ET confirmation
 * @route   POST /api/v1/auth/reset-password
 * @access  Public
 */
const resetPassword = async (req, res) => {
  try {
    const { email, code, nouveauMotDePasse } = req.body;

    // Hasher le code recu pour comparaison
    const hashedCode = crypto.createHash('sha256').update(code).digest('hex');

    // Rechercher utilisateur avec token valide
    const user = await User.findOne({
      email: email.toLowerCase(),
      resetPasswordToken: hashedCode,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      logger.warn(`Code reset invalide ou expire pour: ${email}`);
      return ApiResponse.error(res, 'Code invalide ou expire. Veuillez demander un nouveau code.', 400);
    }

    if (!user.isActive) {
      logger.warn(`Tentative reset - Compte desactive: ${email}`);
      return ApiResponse.forbidden(res, 'Ce compte est desactive. Contactez l\'administrateur.');
    }

    // Valider force du nouveau mot de passe
    const validation = validatePasswordStrength(nouveauMotDePasse);
    if (!validation.isValid) {
      return ApiResponse.validationError(res, validation.errors.map(err => ({ message: err })));
    }

    // Creer demande de confirmation (au lieu d'appliquer directement)
    const confirmationToken = await user.createPendingPasswordChange(nouveauMotDePasse);
    
    // Nettoyer le reset token (deja utilise)
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    
    await user.save();

    // Envoyer email de confirmation
    try {
      await emailService.sendPasswordChangeConfirmationRequest(user, confirmationToken);
    } catch (emailError) {
      logger.error('Erreur envoi email confirmation:', emailError);
      user.pendingPasswordChange = undefined;
      await user.save();
      return ApiResponse.error(res, 'Erreur lors de l\'envoi de l\'email de confirmation', 500);
    }

    logger.info(`Demande reinitialisation MDP envoyee a ${user.email}`);

    return ApiResponse.success(res, {
      requiresConfirmation: true,
      message: 'Un email de confirmation a ete envoye. Veuillez confirmer le changement de mot de passe.',
      email: user.email,
      canLogin: false, // Ne peut pas se connecter avant confirmation
    }, 'Confirmation requise');

  } catch (error) {
    logger.error('Erreur resetPassword:', error);
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
    logger.error('Erreur getMe:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Deconnexion
 * @route   POST /api/v1/auth/logout
 * @access  Private
 */
const logout = async (req, res) => {
  try {
    const user = req.user;
    logger.info(`Deconnexion - ${user.email}`);

    return ApiResponse.success(res, {
      message: 'Deconnexion reussie',
    }, 'Deconnexion reussie');

  } catch (error) {
    logger.error('Erreur logout:', error);
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

    logger.info(`Token FCM enregistre - ${user.email}`);

    return ApiResponse.success(res, {
      message: 'Token FCM enregistre',
    });

  } catch (error) {
    logger.error('Erreur registerFCMToken:', error);
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

    logger.info(`Token FCM supprime - ${user.email}`);

    return ApiResponse.success(res, {
      message: 'Token FCM supprime',
    });

  } catch (error) {
    logger.error('Erreur removeFCMToken:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Verifier token (healthcheck)
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
    logger.error('Erreur verifyToken:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Creer un admin (route publique - DEVELOPPEMENT UNIQUEMENT)
 * @route   POST /api/v1/auth/create-admin
 * @access  Public
 */
const createAdmin = async (req, res) => {
  try {
    const { 
      prenom, 
      nom, 
      email, 
      numeroTelephone, 
      motDePasse,
      carteIdentite,
      photoIdentiteUrl,
      photoIdentitePublicId,
      dateNaissance,
      adresse
    } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return ApiResponse.error(res, 'Cet email est deja utilise', 400);
    }

    const existingPhone = await User.findOne({ numeroTelephone });
    if (existingPhone) {
      return ApiResponse.error(res, 'Ce numero de telephone est deja utilise', 400);
    }

    if (carteIdentite) {
      const existingCard = await User.findOne({ carteIdentite: carteIdentite.toUpperCase() });
      if (existingCard) {
        return ApiResponse.error(res, 'Cette carte d\'identite est deja utilisee', 400);
      }
    }

    let dateNaissanceValue = dateNaissance;
    if (dateNaissanceValue) {
      const age = Math.floor((Date.now() - new Date(dateNaissanceValue)) / (365.25 * 24 * 60 * 60 * 1000));
      if (age < 18) {
        return ApiResponse.error(res, 'L\'admin doit avoir au moins 18 ans', 400);
      }
    } else {
      dateNaissanceValue = new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000);
    }

    const admin = await User.create({
      prenom,
      nom,
      email: email.toLowerCase(),
      numeroTelephone,
      motDePasse,
      carteIdentite: carteIdentite || `TEMP_${Date.now()}`,
      dateNaissance: dateNaissanceValue,
      adresse: adresse || '',
      photoIdentite: {
        url: photoIdentiteUrl || 'https://via.placeholder.com/200',
        publicId: photoIdentitePublicId || `temp_${Date.now()}`,
        isLocked: true,
      },
      role: ROLES.ADMIN,
      isActive: true,
      isFirstLogin: false,
    });

    logger.info(`Admin cree via route publique - ${admin.email}`);

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
    }, 'Admin cree avec succes');

  } catch (error) {
    logger.error('Erreur createAdmin:', error);
    return ApiResponse.serverError(res);
  }
};

module.exports = {
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
  verifyToken,
  createAdmin,
};
