// controllers/auth.controller.js
const User = require('../models/User');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { generateTokenPair } = require('../config/jwt');
const { validatePasswordStrength } = require('../utils/helpers');
const emailService = require('../services/email.service');
const crypto = require('crypto');
const { ROLES } = require('../config/constants');

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
      logger.warn(`Tentative connexion échouée - Utilisateur introuvable: ${identifier}`);
      
      await User.findOneAndUpdate(
        { $or: [{ email: identifier }, { numeroTelephone: identifier }] },
        { $push: { loginHistory: { date: Date.now(), ip: req.ip, userAgent: req.get('user-agent'), success: false } } }
      );

      return ApiResponse.unauthorized(res, 'Identifiants incorrects');
    }

    // Vérifier si compte actif
    if (!user.isActive) {
      logger.warn(`Tentative connexion compte désactivé: ${user.email}`);
      return ApiResponse.forbidden(res, 'Votre compte a été désactivé. Contactez l\'administrateur.');
    }

    // Vérifier mot de passe
    const isPasswordValid = await user.comparePassword(motDePasse);

    if (!isPasswordValid) {
      logger.warn(`Mot de passe incorrect pour: ${user.email}`);
      
      user.logLogin(req.ip, req.get('user-agent'), false);
      await user.save();

      return ApiResponse.unauthorized(res, 'Identifiants incorrects');
    }

    // Connexion réussie
    user.logLogin(req.ip, req.get('user-agent'), true);
    await user.save();

    //  RECHARGER l'utilisateur pour avoir isFirstLogin à jour
    const updatedUser = await User.findById(user._id);

    // Générer tokens JWT avec les données à jour
    const { accessToken, refreshToken } = generateTokenPair(updatedUser);

    logger.info(`Connexion réussie - ${updatedUser.email} (${updatedUser.role})`);

    // CONSTRUCTION DE LA RÉPONSE AVEC INDICATION CLAIRE
    const responseData = {
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
    };

    // MESSAGE SPÉCIAL SI CHANGEMENT DE MOT DE PASSE REQUIS
    let message = 'Connexion réussie';
    
   

    return ApiResponse.success(res, responseData, message);

  } catch (error) {
    logger.error('Erreur login:', error);
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

    // 1. LOG POUR DEBUG
    logger.info(`Tentative changement MDP première connexion - User: ${user.email}, isFirstLogin: ${user.isFirstLogin}`);

    // 2. Vérifier que c'est bien la première connexion
    if (!user.isFirstLogin) {
      logger.warn(`Utilisateur ${user.email} a tenté de changer son MDP via first-password-change alors qu'il n'est pas en première connexion`);
      return ApiResponse.error(res, 'Cette action est réservée à la première connexion. Utilisez /change-password à la place.', 400);
    }

    // 3. Vérifier que les champs sont présents
    if (!ancienMotDePasse || !nouveauMotDePasse) {
      return ApiResponse.error(res, 'L\'ancien et le nouveau mot de passe sont requis', 400);
    }

    // 4. Vérifier ancien mot de passe
    let isOldPasswordValid;
    try {
      isOldPasswordValid = await user.comparePassword(ancienMotDePasse);
    } catch (error) {
      logger.error(`Erreur lors de la comparaison du mot de passe pour ${user.email}:`, error);
      return ApiResponse.error(res, 'Erreur lors de la vérification du mot de passe', 500);
    }

    if (!isOldPasswordValid) {
      logger.warn(`Ancien mot de passe incorrect pour ${user.email}`);
      return ApiResponse.error(res, 'Ancien mot de passe incorrect', 400);
    }

    // 5. Vérifier que nouveau ≠ ancien
    if (ancienMotDePasse === nouveauMotDePasse) {
      return ApiResponse.error(res, 'Le nouveau mot de passe doit être différent de l\'ancien', 400);
    }

    // 6. Valider force du nouveau mot de passe
    let validation;
    try {
      validation = validatePasswordStrength(nouveauMotDePasse);
      
      if (!validation.isValid) {
        return ApiResponse.validationError(res, validation.errors.map(err => ({ message: err })));
      }
    } catch (error) {
      logger.error(`Erreur validation mot de passe pour ${user.email}:`, error);
      // Si la fonction validatePasswordStrength n'existe pas, on fait une validation basique
      if (nouveauMotDePasse.length < 8) {
        return ApiResponse.error(res, 'Le mot de passe doit contenir au moins 8 caractères', 400);
      }
      // On continue si la validation échoue mais que le MDP a au moins 8 caractères
    }

    // 7. Mettre à jour le mot de passe
    try {
      user.motDePasse = nouveauMotDePasse;
      user.isFirstLogin = false;
      user.lastPasswordChange = Date.now();
      await user.save();
      
      logger.info(` MDP sauvegardé avec isFirstLogin: ${user.isFirstLogin}`);
    } catch (error) {
      logger.error(`Erreur lors de la sauvegarde du nouveau mot de passe pour ${user.email}:`, error);
      return ApiResponse.error(res, 'Erreur lors de la sauvegarde du nouveau mot de passe', 500);
    }

    //  CRITIQUE : RECHARGER L'UTILISATEUR DEPUIS LA DB
    // Pour s'assurer que isFirstLogin: false est bien persisté
    const updatedUser = await User.findById(user._id);
    
    if (!updatedUser) {
      logger.error(`Impossible de recharger l'utilisateur ${user.email} après changement de MDP`);
      return ApiResponse.error(res, 'Erreur lors de la mise à jour', 500);
    }

    logger.info(` User rechargé - isFirstLogin: ${updatedUser.isFirstLogin}`);

    //  GÉNÉRER DE NOUVEAUX TOKENS AVEC L'UTILISATEUR RECHARGÉ
    const { accessToken, refreshToken } = generateTokenPair(updatedUser);

    // 8. Envoyer email confirmation (ne pas bloquer si ça échoue)
    try {
      await emailService.sendPasswordChangeConfirmation(updatedUser);
    } catch (emailError) {
      logger.error(`Erreur envoi email confirmation pour ${updatedUser.email}:`, emailError);
      // On ne bloque pas la réponse si l'email échoue
    }

    return ApiResponse.success(res, {
      message: 'Mot de passe changé avec succès. Vous avez accès à l\'application.',
      user: {
        id: updatedUser._id,
        email: updatedUser.email,
        isFirstLogin: updatedUser.isFirstLogin, // Doit être FALSE
      },
      accessToken,
      refreshToken,
    }, 'Mot de passe changé');

  } catch (error) {
    logger.error(`Erreur globale firstPasswordChange:`, error);
    logger.error(`Stack trace:`, error.stack);
    return ApiResponse.serverError(res, 'Une erreur est survenue lors du changement de mot de passe');
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

    logger.info(`✓ Changement MDP volontaire - ${user.email}`);

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
    logger.error('✗ Erreur changePassword:', error);
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

    // Rechercher l'utilisateur par email
    const user = await User.findOne({ email: email.toLowerCase() });

    // ERREUR SI EMAIL N'EXISTE PAS
    if (!user) {
      logger.warn(`Tentative reset MDP - Email inexistant: ${email}`);
      return ApiResponse.notFound(res, 'Aucun compte associé à cet email');
    }

    // Vérifier si le compte est actif
    if (!user.isActive) {
      logger.warn(`Tentative reset MDP - Compte désactivé: ${email}`);
      return ApiResponse.forbidden(res, 'Ce compte est désactivé. Contactez l\'administrateur.');
    }

    // Générer code 6 chiffres
    const resetCode = user.generatePasswordResetToken();
    await user.save();

    // Envoyer email avec code
    try {
      await emailService.sendPasswordResetCode(user, resetCode);
      logger.info(`Code reset envoyé à ${user.email}`);
    } catch (emailError) {
      logger.error('Erreur envoi email reset:', emailError);
      
      // Nettoyer le token si l'envoi échoue
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save();
      
      return ApiResponse.error(res, 'Erreur lors de l\'envoi de l\'email. Veuillez réessayer plus tard.', 500);
    }

    return ApiResponse.success(res, {
      message: 'Un code de vérification a été envoyé à votre email.',
      email: user.email,
      expiresIn: '15 minutes',
    }, 'Code envoyé');

  } catch (error) {
    logger.error('Erreur forgotPassword:', error);
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

    // Rechercher utilisateur avec token valide
    const user = await User.findOne({
      email: email.toLowerCase(),
      resetPasswordToken: hashedCode,
      resetPasswordExpire: { $gt: Date.now() },
    });

    // ERREUR SI CODE INVALIDE OU EXPIRÉ
    if (!user) {
      logger.warn(`Code reset invalide ou expiré pour: ${email}`);
      return ApiResponse.error(res, 'Code invalide ou expiré. Veuillez demander un nouveau code.', 400);
    }

    // Vérifier si le compte est actif
    if (!user.isActive) {
      logger.warn(`Tentative reset - Compte désactivé: ${email}`);
      return ApiResponse.forbidden(res, 'Ce compte est désactivé. Contactez l\'administrateur.');
    }

    // Valider force du nouveau mot de passe
    const validation = validatePasswordStrength(nouveauMotDePasse);
    if (!validation.isValid) {
      return ApiResponse.validationError(res, validation.errors.map(err => ({ message: err })));
    }

    // Réinitialiser le mot de passe
    user.motDePasse = nouveauMotDePasse;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    user.lastPasswordChange = Date.now();
    
    // Si c'était la première connexion, on la marque comme effectuée
    if (user.isFirstLogin) {
      user.isFirstLogin = false;
    }
    
    await user.save();

    logger.info(`Reset MDP réussi - ${user.email}`);

    // Envoyer email de confirmation
    try {
      await emailService.sendPasswordChangeConfirmation(user);
    } catch (emailError) {
      logger.error('Erreur envoi email confirmation:', emailError);
      // On continue même si l'email échoue
    }

    return ApiResponse.success(res, {
      message: 'Mot de passe réinitialisé avec succès. Vous pouvez maintenant vous connecter.',
      canLogin: true,
    }, 'Mot de passe réinitialisé');

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
    logger.error('✗ Erreur getMe:', error);
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

    logger.info(`✓ Déconnexion - ${user.email}`);

    return ApiResponse.success(res, {
      message: 'Déconnexion réussie',
    }, 'Déconnexion réussie');

  } catch (error) {
    logger.error('✗ Erreur logout:', error);
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

    logger.info(`✓ Token FCM enregistré - ${user.email}`);

    return ApiResponse.success(res, {
      message: 'Token FCM enregistré',
    });

  } catch (error) {
    logger.error('✗ Erreur registerFCMToken:', error);
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

    logger.info(`✓ Token FCM supprimé - ${user.email}`);

    return ApiResponse.success(res, {
      message: 'Token FCM supprimé',
    });

  } catch (error) {
    logger.error('✗ Erreur removeFCMToken:', error);
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
    logger.error('✗ Erreur verifyToken:', error);
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

    // Vérifier si la carte d'identité existe déjà 
    if (carteIdentite) {
      const existingCard = await User.findOne({ carteIdentite: carteIdentite.toUpperCase() });
      if (existingCard) {
        return ApiResponse.error(res, 'Cette carte d\'identité est déjà utilisée', 400);
      }
    }

    // Valider la date de naissance si fournie
    let dateNaissanceValue = dateNaissance;
    if (dateNaissanceValue) {
      const age = Math.floor((Date.now() - new Date(dateNaissanceValue)) / (365.25 * 24 * 60 * 60 * 1000));
      if (age < 18) {
        return ApiResponse.error(res, 'L\'admin doit avoir au moins 18 ans', 400);
      }
    } else {
      // Fournir une date par défaut (18 ans d'ici)
      dateNaissanceValue = new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000);
    }

    // Créer l'admin avec les champs obligatoires
    const admin = await User.create({
      prenom,
      nom,
      email: email.toLowerCase(),
      numeroTelephone,
      motDePasse,
      carteIdentite: carteIdentite || `TEMP_${Date.now()}`, // ID temporaire si non fourni
      dateNaissance: dateNaissanceValue,
      adresse: adresse || '',
      photoIdentite: {
        url: photoIdentiteUrl || 'https://via.placeholder.com/200',
        publicId: photoIdentitePublicId || `temp_${Date.now()}`,
        isLocked: true,
      },
      role: ROLES.ADMIN,
      isActive: true,
      isFirstLogin: false, // Pas de changement de mot de passe obligatoire
    });

    logger.info(`✓ Admin créé via route publique - ${admin.email}`);

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
    logger.error('✗ Erreur createAdmin:', error);
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